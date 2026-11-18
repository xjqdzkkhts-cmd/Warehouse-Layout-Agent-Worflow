"""在 Blender 内运行：按 X/Y/Z 三轴分别设数量与间距的几何节点阵列（用户偏好：可编辑性最强）。

适用：规则重复区域——立库一排（X=货位数，Z=竖向节数）、背靠背货架（X=组数，Y=2）、托盘矩形阵列（X×Y，Z=堆叠层）。
不适用：间距不规则的点（输送线、巷道端护栏）——用 gn_point_instancer.py 的点位方式。

约定：
  - 对象原点 = 第一个单元的中心（底面），数量增加时沿局部 +X / +Y / +Z 延伸；朝向靠对象旋转。
  - 有缺口的排/列拆成多个连续段（每段一个对象），同一排/列的段挂在同一个父空对象下，便于整体选中移动。
  - 单元尺寸（单元长X/深Y/高Z）为 0 时跟随对应间距；资产按 单元尺寸 ÷ 资产尺寸 缩放，并按资产基点（包围盒中心 XY、底面 Z）平移对齐。

用法：
    exec(open(".../gn_point_instancer.py").read())   # 复用 collection_size / ensure_asset_group / asset_collection / instance_stats
    exec(open(".../gn_xyz_array.py").read())
    ob = build_xyz_array("立库_第01排", "横梁货架", origin=(x, y), rz=0.0,
                         nx=39, dx=2.35, ny=1, dy=1.3, nz=5, dz=4.0, ux=2.35, uy=1.2, uz=0,
                         lift=0.0, target_collection=coll, parent=None)
    set_xyz(ob, X数量=40, Z数量=6)
已在 Blender 4.4 验证：与点位方式的实例数、包围盒一致。
"""
import bpy
from mathutils import Matrix

XYZ_NAME = "GN_XYZ阵列"
XYZ_INPUTS = [
    ("资产", 'NodeSocketCollection', None),
    ("资产尺寸", 'NodeSocketVector', (1.0, 1.0, 1.0)),
    ("资产基点", 'NodeSocketVector', (0.0, 0.0, 0.0)),
    ("X数量", 'NodeSocketInt', 1), ("X间距", 'NodeSocketFloat', 1.0),
    ("Y数量", 'NodeSocketInt', 1), ("Y间距", 'NodeSocketFloat', 1.0),
    ("Z数量", 'NodeSocketInt', 1), ("Z间距", 'NodeSocketFloat', 1.0),
    ("单元长X", 'NodeSocketFloat', 0.0), ("单元深Y", 'NodeSocketFloat', 0.0), ("单元高Z", 'NodeSocketFloat', 0.0),
    ("离地高度", 'NodeSocketFloat', 0.0),
]


def ensure_xyz_node_group(rebuild=False):
    ng = bpy.data.node_groups.get(XYZ_NAME)
    if ng and not rebuild:
        return ng
    if ng:
        bpy.data.node_groups.remove(ng)
    ng = bpy.data.node_groups.new(XYZ_NAME, 'GeometryNodeTree')
    I = ng.interface
    I.new_socket("Geometry", in_out='INPUT', socket_type='NodeSocketGeometry')
    for name, st, dv in XYZ_INPUTS:
        s = I.new_socket(name, in_out='INPUT', socket_type=st)
        if dv is not None:
            s.default_value = dv
        if st == 'NodeSocketInt':
            s.min_value = 1
    I.new_socket("Geometry", in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N, L = ng.nodes, ng.links
    gi = N.new('NodeGroupInput'); go = N.new('NodeGroupOutput')
    g = gi.outputs

    def math(op, a, b):
        m = N.new('ShaderNodeMath'); m.operation = op
        for i, v in enumerate((a, b)):
            if isinstance(v, (int, float)):
                m.inputs[i].default_value = v
            else:
                L.new(v, m.inputs[i])
        return m.outputs[0]

    def line(count, spacing, axis):
        c = N.new('ShaderNodeCombineXYZ'); L.new(spacing, c.inputs[axis])
        ml = N.new('GeometryNodeMeshLine'); ml.mode = 'OFFSET'
        L.new(count, ml.inputs['Count']); L.new(c.outputs[0], ml.inputs['Offset'])
        return ml.outputs[0]

    def follow(size, spacing):
        c = N.new('FunctionNodeCompare'); c.data_type = 'FLOAT'; c.operation = 'GREATER_THAN'
        L.new(size, c.inputs[0]); c.inputs[1].default_value = 0.0
        sw = N.new('GeometryNodeSwitch'); sw.input_type = 'FLOAT'
        L.new(c.outputs[0], sw.inputs['Switch']); L.new(spacing, sw.inputs['False']); L.new(size, sw.inputs['True'])
        return sw.outputs[0]

    # X 线 × Y 线 × Z 线 → 网格点
    lx = line(g["X数量"], g["X间距"], 0)
    ly = line(g["Y数量"], g["Y间距"], 1)
    lz = line(g["Z数量"], g["Z间距"], 2)
    i1 = N.new('GeometryNodeInstanceOnPoints'); L.new(lx, i1.inputs['Points']); L.new(ly, i1.inputs['Instance'])
    r1 = N.new('GeometryNodeRealizeInstances'); L.new(i1.outputs[0], r1.inputs[0])
    i2 = N.new('GeometryNodeInstanceOnPoints'); L.new(r1.outputs[0], i2.inputs['Points']); L.new(lz, i2.inputs['Instance'])
    r2 = N.new('GeometryNodeRealizeInstances'); L.new(i2.outputs[0], r2.inputs[0])
    lift = N.new('ShaderNodeCombineXYZ'); L.new(g["离地高度"], lift.inputs[2])
    sp = N.new('GeometryNodeSetPosition'); L.new(r2.outputs[0], sp.inputs['Geometry']); L.new(lift.outputs[0], sp.inputs['Offset'])
    # 缩放 = 单元尺寸 / 资产尺寸
    asz = N.new('ShaderNodeSeparateXYZ'); L.new(g["资产尺寸"], asz.inputs[0])
    sc = N.new('ShaderNodeCombineXYZ')
    L.new(math('DIVIDE', follow(g["单元长X"], g["X间距"]), asz.outputs[0]), sc.inputs[0])
    L.new(math('DIVIDE', follow(g["单元深Y"], g["Y间距"]), asz.outputs[1]), sc.inputs[1])
    L.new(math('DIVIDE', follow(g["单元高Z"], g["Z间距"]), asz.outputs[2]), sc.inputs[2])
    ci = N.new('GeometryNodeCollectionInfo'); ci.transform_space = 'ORIGINAL'
    L.new(g["资产"], ci.inputs['Collection'])
    i3 = N.new('GeometryNodeInstanceOnPoints')
    L.new(sp.outputs[0], i3.inputs['Points']); L.new(ci.outputs[0], i3.inputs['Instance']); L.new(sc.outputs[0], i3.inputs['Scale'])
    # 资产基点对齐（局部空间平移会乘上实例缩放）
    neg = N.new('ShaderNodeVectorMath'); neg.operation = 'SCALE'; neg.inputs['Scale'].default_value = -1.0
    L.new(g["资产基点"], neg.inputs[0])
    tr = N.new('GeometryNodeTranslateInstances'); tr.inputs['Local Space'].default_value = True
    L.new(i3.outputs[0], tr.inputs['Instances']); L.new(neg.outputs[0], tr.inputs['Translation'])
    L.new(tr.outputs[0], go.inputs[0])
    for i, n in enumerate(N):
        n.location = ((i % 8) * 200, -(i // 8) * 250)
    return ng


def _xyz_ids(ng):
    return {s.name: s.identifier for s in ng.interface.items_tree if s.in_out == 'INPUT'}


def ensure_parent(name, location, target_collection):
    p = bpy.data.objects.get(name)
    if p is None:
        p = bpy.data.objects.new(name, None)
        p.empty_display_type = 'PLAIN_AXES'; p.empty_display_size = 1.0
        p.location = (location[0], location[1], 0.0)
        target_collection.objects.link(p)
    return p


def build_xyz_array(name, asset, origin, rz=0.0, nx=1, dx=1.0, ny=1, dy=1.0, nz=1, dz=1.0,
                    ux=0.0, uy=0.0, uz=0.0, lift=0.0, target_collection=None, parent=None, props=None):
    """origin=(x, y)：第一个单元的中心（世界坐标，米）。parent：父空对象名（可选）。"""
    ng = ensure_xyz_node_group()
    ensure_asset_group([asset])
    coll = asset_collection(asset)
    size, lo, hi = collection_size(coll)
    base = ((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2])
    me = bpy.data.meshes.new(name)
    ob = bpy.data.objects.new(name, me)
    ob.location = (origin[0], origin[1], 0.0); ob.rotation_euler = (0, 0, rz)
    for k, v in (props or {}).items():
        ob[k] = v
    tc = target_collection or bpy.context.scene.collection
    tc.objects.link(ob)
    m = ob.modifiers.new("XYZ阵列", 'NODES'); m.node_group = ng
    ids = _xyz_ids(ng)
    vals = {"资产": coll, "资产尺寸": tuple(size), "资产基点": base,
            "X数量": int(nx), "X间距": float(dx), "Y数量": int(ny), "Y间距": float(dy), "Z数量": int(nz), "Z间距": float(dz),
            "单元长X": float(ux), "单元深Y": float(uy), "单元高Z": float(uz), "离地高度": float(lift)}
    for k, v in vals.items():
        m[ids[k]] = v
    if parent:
        p = ensure_parent(parent, origin, tc)
        # 新建对象的 matrix_world 在视图层更新前仍是单位矩阵，直接取逆会让子对象位移被叠加两次；
        # 所以用父级自身的 location/rotation/scale 构造矩阵。
        pm = Matrix.LocRotScale(p.location, p.rotation_euler, p.scale)
        ob.parent = p
        ob.matrix_parent_inverse = pm.inverted()
    ob.update_tag(); bpy.context.view_layer.update()
    return ob


def set_xyz(ob, **kw):
    """set_xyz(ob, X数量=40, Z数量=6, Z间距=3.5, 离地高度=0.2)"""
    m = ob.modifiers["XYZ阵列"]
    ids = _xyz_ids(m.node_group)
    for k, v in kw.items():
        m[ids[k]] = v
    ob.update_tag(); bpy.context.view_layer.update()
