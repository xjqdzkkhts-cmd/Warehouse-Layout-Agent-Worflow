"""Blender GN ascending belt builder. Creates one object; never deletes or saves a scene.
Origin is the spiral low mouth (not center); local incoming travel points -X.
Rotate the object around Z to orient it. Fixed topology resolution is chosen at creation.
"""
import bpy
import math

def build_spiral(name="螺旋皮带机_几何节点", *, origin=(0,0,0), rotation=0,
                 height=1.6, slope_degrees=13.5084029265, radius=1.06,
                 width=.68, inlet_length=1.3, outlet_length=1.8,
                 segments=None, collection=None):
    values=(height,slope_degrees,radius,width,inlet_length,outlet_length)
    if not all(math.isfinite(v) for v in values):
        raise ValueError("Parameters must be finite")
    if not (.2<=height<=12 and 2<=slope_degrees<=35 and .5<=radius<=5
            and .2<=width<=.9 and .1<=inlet_length<=10 and .1<=outlet_length<=10):
        raise ValueError("Parameters outside supported UI ranges")
    if radius<=width/2+.1:
        raise ValueError("Inner rail radius must remain positive")
    turns=height/(2*math.pi*radius*math.tan(math.radians(slope_degrees)))
    segments=segments or max(24,math.ceil(turns*48))
    if not isinstance(segments,int) or segments<4:
        raise ValueError("segments must be an integer >=4")
    ng=bpy.data.node_groups.new('GN_螺旋皮带机_坡度与高度','GeometryNodeTree');ng.is_modifier=True
    ng.interface.new_socket(name='Geometry',in_out='INPUT',socket_type='NodeSocketGeometry');ng.interface.new_socket(name='Geometry',in_out='OUTPUT',socket_type='NodeSocketGeometry')
    params=[('坡度（度）',slope_degrees,2,35),('整体高度',height,.2,12),('中心半径',radius,.5,5),('皮带宽度',width,.2,.9),('护栏高度',.1,.03,.5),('护栏厚度',.03,.01,.10),('入口接驳长度',inlet_length,.1,10),('出口接驳长度',outlet_length,.1,10)]
    for name,val,lo,hi in params:
     q=ng.interface.new_socket(name=name,in_out='INPUT',socket_type='NodeSocketFloat');q.default_value=val;q.min_value=lo;q.max_value=hi
     q.description='入口到出口的提升高度（米），不含护栏' if name=='整体高度' else ('中心线与水平面的夹角；改变后圈数和出口方向自动变化' if name=='坡度（度）' else name)
    ns=ng.nodes;ls=ng.links;inp=ns.new('NodeGroupInput');out=ns.new('NodeGroupOutput');inp.location=(-1100,200);out.location=(1200,200)
    def mathn(op,a,b=None):
     n=ns.new('ShaderNodeMath');n.operation=op
     for i,v in enumerate([a,b]):
      if v is None:continue
      if isinstance(v,(float,int)):n.inputs[i].default_value=v
      else:ls.new(v,n.inputs[i])
     return n.outputs[0]
    def attr(name):
     n=ns.new('GeometryNodeInputNamedAttribute');n.data_type='FLOAT';n.inputs['Name'].default_value=name;return n.outputs['Attribute']
    t=attr('路径比例');radial=attr('宽度系数');thick=attr('厚度系数');hf=attr('护栏系数');ext=attr('接驳系数')
    h=inp.outputs['整体高度'];r=inp.outputs['中心半径'];slope=mathn('RADIANS',inp.outputs['坡度（度）']);ang=mathn('DIVIDE',h,mathn('MULTIPLY',r,mathn('TANGENT',slope)));theta=mathn('ADD',math.pi/2,mathn('MULTIPLY',t,ang));si=mathn('SINE',theta);co=mathn('COSINE',theta)
    rr=mathn('ADD',r,mathn('ADD',mathn('MULTIPLY',radial,inp.outputs['皮带宽度']),mathn('MULTIPLY',thick,inp.outputs['护栏厚度'])))
    # Signed extension: negative at inlet, positive at outlet, tangent follows spiral.
    extlen=mathn('ADD',mathn('MULTIPLY',mathn('MINIMUM',ext,0),inp.outputs['入口接驳长度']),mathn('MULTIPLY',mathn('MAXIMUM',ext,0),inp.outputs['出口接驳长度']))
    x=mathn('SUBTRACT',mathn('MULTIPLY',rr,co),mathn('MULTIPLY',extlen,si));y=mathn('ADD',mathn('SUBTRACT',mathn('MULTIPLY',rr,si),r),mathn('MULTIPLY',extlen,co));z=mathn('ADD',mathn('MULTIPLY',t,h),mathn('MULTIPLY',hf,inp.outputs['护栏高度']))
    comb=ns.new('ShaderNodeCombineXYZ')
    for key,val in zip(['X','Y','Z'],[x,y,z]):ls.new(val,comb.inputs[key])
    sp=ns.new('GeometryNodeSetPosition');ls.new(inp.outputs['Geometry'],sp.inputs['Geometry']);ls.new(comb.outputs[0],sp.inputs['Position']);ls.new(sp.outputs['Geometry'],out.inputs['Geometry'])
    # Fixed low-poly topology, parameterized entirely through GN fields.
    rings=[(0,-1)]+[(j/segments,0) for j in range(segments+1)]+[(1,1)]
    verts=[];faces=[];values={k:[] for k in ['路径比例','宽度系数','厚度系数','护栏系数','接驳系数']};mats=[]
    profiles=[([(-.5,0,0),(.5,0,0)],False,0),([(-.5,-1,0),(-.5,0,0),(-.5,0,1),(-.5,-1,1)],True,1),([(.5,0,0),(.5,1,0),(.5,1,1),(.5,0,1)],True,1)]
    for profile,closed,mat in profiles:
     base=len(verts);k=len(profile)
     for t0,e in rings:
      for w,b,hf0 in profile:
       verts.append((0,0,0))
       for name,value in zip(values,[t0,w,b,hf0,e]):values[name].append(value)
     for j in range(len(rings)-1):
      for i in range(k if closed else k-1):faces.append((base+j*k+i,base+j*k+(i+1)%k,base+(j+1)*k+(i+1)%k,base+(j+1)*k+i));mats.append(mat)
     if closed:
      faces += [tuple(base+i for i in reversed(range(k))),tuple(base+(len(rings)-1)*k+i for i in range(k))];mats += [mat,mat]
    me=bpy.data.meshes.new('螺旋参数拓扑');me.from_pydata(verts,[],faces)
    for name,vals in values.items():a=me.attributes.new(name,'FLOAT','POINT');a.data.foreach_set('value',vals)
    for n,color in [('皮带_深灰',(.10,.14,.18,1)),('侧栏_银灰',(.50,.59,.66,1))]:
     m=bpy.data.materials.get(n) or bpy.data.materials.new(n);m.diffuse_color=color;me.materials.append(m)
    for p,mi in zip(me.polygons,mats):p.material_index=mi
    obj=bpy.data.objects.new(name,me);(collection or bpy.context.scene.collection).objects.link(obj);obj.location=origin;obj.rotation_euler.z=rotation;mod=obj.modifiers.new('螺旋参数｜坡度与整体高度','NODES');mod.node_group=ng
    ids={s.name:s.identifier for s in ng.interface.items_tree if s.in_out=='INPUT'}
    def setval(n,v):getattr(mod.properties.inputs,ids[n]).value=v;obj.update_tag();bpy.context.view_layer.update()
    for n,v,lo,hi in params:setval(n,v)
    return obj
