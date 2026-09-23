"""在 Blender 内运行：点位驱动的几何节点实例化器（v2，单对象可混合多种资产）。

粒度约定（便于人工调整）：一个“可独立调整的单元”一个对象——
  立库：每排一个；横梁/搁板货架：每列（一整列背靠背组）一个；地堆：每个托盘区块一个；
  产线：每条直线输送线一个（线上的输送机、顶升、检测、叉车口等混在同一对象里）；
  护栏/端部附件：同一类同一排布一组一个。
不要把整个区域塞进一个对象。

用法：
    exec(open(".../gn_point_instancer.py").read())
    grp = ensure_asset_group(["横梁货架", "链式机最短", ...], lib_path)   # 从资产库链接，建资产组
    ob = build_point_object("立库_第01排", pts, sections=5, total_height=20.0, lift=0.0,
                            target_collection=coll, props={"来源编号": "..."})
    pts 为 dict 列表：{"x","y","z","asset","sx","sy","sz","rz"}
        x,y,z：实例原点（米，已做资产中心补偿）；sx,sy,sz：目标尺寸（资产局部轴，米）；rz：绕 Z 弧度。
    set_params(ob, 竖向节数=6, 总高=20.0, 离地高度=1.0, 排深覆盖=1.2)
    instance_stats([ob])  -> (网格实例数, 最小角, 最大角)

节点组 GN_点位实例 输入：资产组、竖向节数、总高(0=用每点 size.z)、排深覆盖(0=用每点 size.y)、离地高度。
点属性：size / asize(资产尺寸) / rot (FLOAT_VECTOR)，idx (INT，资产组内序号)。
资产组：集合 “GN资产组” 下的代理子集合 “NN_资产名”（Collection Info 分离子项按名称排序，所以用两位序号前缀固定顺序）。
已在 Blender 4.4 验证：与逐个集合实例的实例数和包围盒一致。
"""
import bpy
from mathutils import Vector

GN_NAME = "GN_点位实例"
GROUP_NAME = "GN资产组"


# ---------- 资产组 ----------

_SIZE_CACHE = {}


def collection_size(coll):
    """资产求值包围盒 (尺寸, 最小角, 最大角)。
    链接进来的集合里的对象不在场景中，matrix_world 未求值（父子/约束不生效），直接读会得到错误尺寸；
    所以用临时集合实例空对象求值后测量。"""
    key = (coll.name, coll.library.filepath if coll.library else "")
    if key in _SIZE_CACHE:
        return _SIZE_CACHE[key]
    tmp = bpy.data.objects.new("__size_probe", None)
    tmp.instance_type = 'COLLECTION'; tmp.instance_collection = coll
    bpy.context.scene.collection.objects.link(tmp)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    lo = Vector((1e9,) * 3); hi = -lo
    for inst in dg.object_instances:
        if inst.is_instance and inst.parent and inst.parent.name == tmp.name and inst.object.type in {'MESH', 'CURVE'}:
            for v in inst.object.bound_box:
                w = inst.matrix_world @ Vector(v)
                lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    bpy.data.objects.remove(tmp)
    _SIZE_CACHE[key] = (tuple(hi - lo), tuple(lo), tuple(hi))
    return _SIZE_CACHE[key]


def ensure_asset_group(asset_names, lib_path=None):
    """返回 {资产名: idx}。已有代理保持原序号，新资产追加。缺失的资产从 lib_path 链接。"""
    grp = bpy.data.collections.get(GROUP_NAME)
    if grp is None:
        grp = bpy.data.collections.new(GROUP_NAME)
        grp.use_fake_user = True
    idx = {}
    for p in grp.children:
        n, name = p.name.split("_", 1)
        idx[name] = int(n)
    for name in asset_names:
        if name in idx:
            continue
        src = next((c for c in bpy.data.collections if c.name == name and c.library), None) \
            or bpy.data.collections.get(name)
        if src is None and lib_path:
            with bpy.data.libraries.load(lib_path, link=True) as (a, b):
                b.collections = [name]
            src = b.collections[0]
        if src is None:
            raise KeyError(f"资产集合不存在: {name}")
        i = max(idx.values(), default=-1) + 1
        proxy = bpy.data.collections.new(f"{i:02d}_{name}")
        proxy.children.link(src)
        grp.children.link(proxy)
        idx[name] = i
    return idx


def asset_collection(name):
    grp = bpy.data.collections[GROUP_NAME]
    for p in grp.children:
        if p.name.split("_", 1)[1] == name:
            return p.children[0]
    raise KeyError(name)


# ---------- 节点组 ----------

def ensure_node_group(rebuild=False):
    ng = bpy.data.node_groups.get(GN_NAME)
    if ng and not rebuild:
        return ng
    if ng:
        bpy.data.node_groups.remove(ng)
    ng = bpy.data.node_groups.new(GN_NAME, 'GeometryNodeTree')
    I = ng.interface
    I.new_socket("Geometry", in_out='INPUT', socket_type='NodeSocketGeometry')
    I.new_socket("资产组", in_out='INPUT', socket_type='NodeSocketCollection')
    s = I.new_socket("竖向节数", in_out='INPUT', socket_type='NodeSocketInt'); s.default_value = 1; s.min_value = 1
    s = I.new_socket("总高", in_out='INPUT', socket_type='NodeSocketFloat'); s.default_value = 0.0; s.min_value = 0.0
    s = I.new_socket("排深覆盖", in_out='INPUT', socket_type='NodeSocketFloat'); s.default_value = 0.0; s.min_value = 0.0
    s = I.new_socket("离地高度", in_out='INPUT', socket_type='NodeSocketFloat'); s.default_value = 0.0
    I.new_socket("Geometry", in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N, L = ng.nodes, ng.links
    gi = N.new('NodeGroupInput'); go = N.new('NodeGroupOutput')

    def math(op, a=None, b=None):
        m = N.new('ShaderNodeMath'); m.operation = op
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                m.inputs[i].default_value = v
            else:
                L.new(v, m.inputs[i])
        return m.outputs[0]

    def attr(name, dtype='FLOAT_VECTOR'):
        n = N.new('GeometryNodeInputNamedAttribute'); n.data_type = dtype; n.inputs['Name'].default_value = name
        return n.outputs['Attribute']

    def override(param, fallback):
        c = N.new('FunctionNodeCompare'); c.data_type = 'FLOAT'; c.operation = 'GREATER_THAN'
        L.new(param, c.inputs[0]); c.inputs[1].default_value = 0.0
        sw = N.new('GeometryNodeSwitch'); sw.input_type = 'FLOAT'
        L.new(c.outputs[0], sw.inputs['Switch']); L.new(fallback, sw.inputs['False']); L.new(param, sw.inputs['True'])
        return sw.outputs[0]

    size = N.new('ShaderNodeSeparateXYZ'); L.new(attr("size"), size.inputs[0])
    asize = N.new('ShaderNodeSeparateXYZ'); L.new(attr("asize"), asize.inputs[0])
    height = override(gi.outputs["总高"], size.outputs[2])
    depth = override(gi.outputs["排深覆盖"], size.outputs[1])
    sec_h = math('DIVIDE', height, gi.outputs["竖向节数"])

    # 离地高度
    lift = N.new('ShaderNodeCombineXYZ'); L.new(gi.outputs["离地高度"], lift.inputs[2])
    setp = N.new('GeometryNodeSetPosition')
    L.new(gi.outputs["Geometry"], setp.inputs['Geometry']); L.new(lift.outputs[0], setp.inputs['Offset'])
    # 竖向叠放：单位间距竖线，按每点节高缩放 Z
    line = N.new('GeometryNodeMeshLine'); line.mode = 'OFFSET'
    L.new(gi.outputs["竖向节数"], line.inputs['Count']); line.inputs['Offset'].default_value = (0, 0, 1)
    s1 = N.new('ShaderNodeCombineXYZ'); s1.inputs[0].default_value = 1; s1.inputs[1].default_value = 1
    L.new(sec_h, s1.inputs[2])
    iop1 = N.new('GeometryNodeInstanceOnPoints')
    L.new(setp.outputs[0], iop1.inputs['Points']); L.new(line.outputs[0], iop1.inputs['Instance'])
    L.new(s1.outputs[0], iop1.inputs['Scale'])
    real = N.new('GeometryNodeRealizeInstances'); L.new(iop1.outputs[0], real.inputs[0])
    # 实例化：按 idx 从资产组挑选，缩放 = 目标 / 资产
    sc = N.new('ShaderNodeCombineXYZ')
    L.new(math('DIVIDE', size.outputs[0], asize.outputs[0]), sc.inputs[0])
    L.new(math('DIVIDE', depth, asize.outputs[1]), sc.inputs[1])
    L.new(math('DIVIDE', sec_h, asize.outputs[2]), sc.inputs[2])
    ci = N.new('GeometryNodeCollectionInfo'); ci.transform_space = 'ORIGINAL'
    L.new(gi.outputs["资产组"], ci.inputs['Collection'])
    ci.inputs['Separate Children'].default_value = True
    ci.inputs['Reset Children'].default_value = True
    iop2 = N.new('GeometryNodeInstanceOnPoints')
    L.new(real.outputs[0], iop2.inputs['Points']); L.new(ci.outputs[0], iop2.inputs['Instance'])
    iop2.inputs['Pick Instance'].default_value = True
    L.new(attr("idx", 'INT'), iop2.inputs['Instance Index'])
    L.new(attr("rot"), iop2.inputs['Rotation']); L.new(sc.outputs[0], iop2.inputs['Scale'])
    L.new(iop2.outputs[0], go.inputs[0])
    for i, n in enumerate(N):
        n.location = ((i % 8) * 200, -(i // 8) * 250)
    return ng


# ---------- 对象 ----------

def _ids(ng):
    return {s.name: s.identifier for s in ng.interface.items_tree if s.in_out == 'INPUT'}


def build_point_object(name, pts, sections=1, total_height=0.0, lift=0.0, depth_override=0.0,
                       target_collection=None, props=None):
    ng = ensure_node_group()
    idx = ensure_asset_group(sorted({p["asset"] for p in pts}))
    sizes = {a: collection_size(asset_collection(a))[0] for a in idx}
    me = bpy.data.meshes.new(name)
    me.from_pydata([(p["x"], p["y"], p.get("z", 0.0)) for p in pts], [], [])
    for aname, dtype in (("size", 'FLOAT_VECTOR'), ("asize", 'FLOAT_VECTOR'), ("rot", 'FLOAT_VECTOR'), ("idx", 'INT')):
        me.attributes.new(aname, dtype, 'POINT')
    me.attributes["size"].data.foreach_set("vector", [c for p in pts for c in (p["sx"], p["sy"], p["sz"])])
    me.attributes["asize"].data.foreach_set("vector", [c for p in pts for c in sizes[p["asset"]]])
    me.attributes["rot"].data.foreach_set("vector", [c for p in pts for c in (0.0, 0.0, p.get("rz", 0.0))])
    me.attributes["idx"].data.foreach_set("value", [idx[p["asset"]] for p in pts])
    ob = bpy.data.objects.new(name, me)
    for k, v in (props or {}).items():
        ob[k] = v
    (target_collection or bpy.context.scene.collection).objects.link(ob)
    m = ob.modifiers.new("点位参数", 'NODES'); m.node_group = ng
    ids = _ids(ng)
    m[ids["资产组"]] = bpy.data.collections[GROUP_NAME]
    m[ids["竖向节数"]] = int(sections)
    m[ids["总高"]] = float(total_height)
    m[ids["排深覆盖"]] = float(depth_override)
    m[ids["离地高度"]] = float(lift)
    ob.update_tag(); bpy.context.view_layer.update()
    return ob


def set_params(ob, **kw):
    """set_params(ob, 竖向节数=6, 总高=20.0, 离地高度=1.0, 排深覆盖=1.2)"""
    m = ob.modifiers["点位参数"]
    ids = _ids(m.node_group)
    for k, v in kw.items():
        m[ids[k]] = v
    ob.update_tag(); bpy.context.view_layer.update()


def instance_stats(objs):
    """(网格实例数, 最小角, 最大角)；用于替换前后对比。"""
    dg = bpy.context.evaluated_depsgraph_get()
    names = {o.name for o in objs}
    n = 0; lo = Vector((1e9,) * 3); hi = -lo
    for inst in dg.object_instances:
        if inst.is_instance and inst.parent and inst.parent.name in names and inst.object.type == 'MESH':
            n += 1
            for v in inst.object.bound_box:
                w = inst.matrix_world @ Vector(v)
                lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    return n, [round(x, 3) for x in lo], [round(x, 3) for x in hi]


def empty_to_point(o):
    """集合实例空对象 → 点 dict（资产名取实例集合名）。"""
    a = o.instance_collection.name
    s = collection_size(o.instance_collection)[0]
    # 注意：同名资产在资产组里按名称查找；o 的实例集合须与资产组中的是同一个（同一资产库）
    return dict(x=o.location.x, y=o.location.y, z=o.location.z, asset=a,
                sx=o.scale.x * s[0], sy=o.scale.y * s[1], sz=o.scale.z * s[2], rz=o.rotation_euler.z)


def same_stats(a, b, tol=0.01):
    return a[0] == b[0] and all(abs(x - y) < tol for x, y in zip(a[1] + a[2], b[1] + b[2]))
