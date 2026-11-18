import json,math,collections,hashlib,csv,random,re
from pathlib import Path
from shapely.geometry import Polygon,LineString,Point,box
from shapely.ops import unary_union
from shapely import set_precision
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'输出/识图确认';RAW=OUT/'_过程';DIST=ROOT/'dist';(DIST/'data').mkdir(exist_ok=True)
inv=json.loads((RAW/'inventory.json').read_text());nodes=json.loads((RAW/'device-nodes.json').read_text());geom=json.loads((RAW/'geometry.json').read_text())
ORIGIN=[330000,660000]
def xy(p):return [round((p[0]-ORIGIN[0])*.001,5),round((p[1]-ORIGIN[1])*.001,5)]
def poly(e):return Polygon([xy(p) for p in e['points']]).buffer(0)
def shape(p):
 if p.is_empty:return []
 if p.geom_type=='Polygon':return [{'outer':[[round(x,4),round(y,4)] for x,y in p.exterior.coords],'holes':[[[round(x,4),round(y,4)] for x,y in ring.coords] for ring in p.interiors]}]
 return [s for g in p.geoms if g.geom_type in ['Polygon','MultiPolygon'] for s in shape(g)]
def rect(x0,y0,x1,y1):return box(x0-330,y0-660,x1-330,y1-660)
walls=[g for g in geom if g['source']=='9CED5' and g['layer']=='0-围墙'];boundary=Polygon([xy(p) for g in walls for p in g['points']]).buffer(0)
greens=[poly(g).intersection(boundary) for g in geom if g['source']=='9CED5' and g['layer']=='0-绿化']
# Total-plan footprints: discard canopies, aprons, duplicate single-building outlines.
defs=[('1','综合楼',246.139532,626.857481,267.139532,691.857481,16.3,'office'),('2','2号仓库',204.139532,402.857481,269.139532,566.857481,15,'warehouse'),('3','3号仓库',282.139532,402.857481,472.139532,477.857481,15,'warehouse'),('4','4号仓库',282.139532,491.857481,472.139532,566.857481,15,'warehouse'),('5','5号冷链中心',397.139532,626.857481,487.139532,696.857481,15,'warehouse'),('6','6号冷链中心',290.139532,626.857481,380.139532,696.857481,15,'warehouse'),('7','7号仓库',317.139532,726.857481,487.139532,796.857481,15,'warehouse'),('8','8号仓库',337.139532,860.857481,487.139532,935.857481,15,'warehouse'),('9','公共卫生间',510.139532,367.857481,530.139532,376.857481,6,'service'),('10','配套用房',515.139532,391.857481,530.139532,421.857481,6,'service'),('11','新能源换电站',132.139532,367.857481,144.139532,402.857481,6,'service'),('12','公共卫生间',297.139532,846.857481,317.139532,855.857481,6,'service'),('13','门卫',198.7679,612.3575,202.2679,617.8575,3.9,'gate'),('14','门卫',273.7438,812.8988,277.2438,818.3988,3.9,'gate'),('15','门卫',510.1395,355.3575,515.6395,358.8575,3.9,'gate')]
buildings=[];buildingPolys={}
for id,label,x0,y0,x1,y1,h,kind in defs:
 p=rect(x0,y0,x1,y1);buildingPolys[id]=p
 buildings.append({'id':id,'label':label,'kind':kind,'height':h,'floorTop':.2,'bounds':[[x0-330,y0-660],[x1-330,y1-660]],'outline':shape(p)[0]['outer'],'floorIds':['1'],'hasLayout':id in ['2','5','6'],'wallPolicy':'continuous footprint extrusion with a few regularized loading openings','heightBasis':'园区总图 H 标注'})
def building(r):
 p=Point(xy(r['center']))
 matches=[b['id'] for b in buildings if b['kind']=='warehouse' and buildingPolys[b['id']].buffer(.5).covers(p)]
 return matches[0] if len(matches)==1 else None
def base(r,asset,role):
 p=xy(r['center']);return {'id':'cad-'+r['id'].replace('/','-'),'sourceHandle':r['handle'],'sourcePath':r['id'],'sourceBlock':r['block'],'layer':r['layer'],'building':building(r),'floor':'1','asset':asset,'role':role,'position':[p[0],.2,-p[1]],'yaw':r['yaw'],'size':[round(v*.001,5) for v in r['localSize']],'status':'pending-user-confirmation' if role in ['auxiliary','aux-lift'] else 'cad-derived-display','basis':'evaluated nested CAD block footprint'}
placements=[];excluded=[];review=[];seen=set();binrows=[];mastEndpoints=[];mastRails=[]
for r in nodes:
 b=building(r)
 if not b:continue
 layer=r['topLayer'];name=r['block']
 if layer in ['001横梁货架','001四向车货架','001地堆托盘'] and r['depth']==1:
  role={'001横梁货架':'beam-rack','001四向车货架':'dense-rack','001地堆托盘':'floor-load'}[layer]
  key=(role,round(r['center'][0],1),round(r['center'][1],1))
  if key in seen:excluded.append({'id':r['id'],'reason':'相同世界坐标重复块，合并一次'});continue
  seen.add(key);levels=(5 if b=='2' else 4) if role=='beam-rack' else 4
  asset='beam-rack-'+str(levels) if role=='beam-rack' else 'dense-rack-4' if role=='dense-rack' else 'blue-pallet-load'
  p=base(r,asset,role);p['levels']=levels if role!='floor-load' else 1;p['height']=levels*2 if role!='floor-load' else .86
  if role=='beam-rack':p['yaw']+=90;p['size'].reverse()
  placements.append(p)
 elif '箱位' in r['layer'] and not r['childInserts'] and not '拣货' in r['layer']:
  binrows.append(r)
 elif name=='zw$7050' or name=='小车08':
  p=base(r,'agv-zhilang','agv');p['height']=.40;p['scale']=.75/.50211352;p['deviceLabel']='智狼';placements.append(p)
 elif r['depth']==0 and layer=='001提升机':
  p=base(r,'lift','lift');p['height']=8.8;p['yaw']+=180;p['deviceLabel']='提升机';placements.append(p)
 elif r['depth']==0 and layer in ['001链式输送机','001辊柱输送机']:
  p=base(r,'continuous-chain' if layer=='001链式输送机' else 'continuous-roller','conveyor');p['surfaceHeight']=.8
  if layer=='001辊柱输送机':
   # CAD roller axes lie along the block X axis; flow is perpendicular to them.
   # Preserve the footprint while rotating the functional GLB travel axis.
   p['yaw']+=180
   p['asset']='continuous-roller-w'+str(round(p['size'][0]*1000))+'-l'+str(round(p['size'][1]*1000))
   p['basis']+='; roller axis from CAD repeated transverse strokes, flow along adjoining roller centres'
  else:
   p['yaw']+=90;p['size'].reverse()
   p['asset']='continuous-chain-w'+str(round(p['size'][0]*1000))+'-l'+str(round(p['size'][1]*1000))
  placements.append(p)
 elif name=='DFBFNGH':
  p=base(r,'packing-table','station');p['deviceLabel']='打包台';p['height']=.85;placements.append(p)
 elif r['depth']==0 and name=='fhz1':
  excluded.append({'id':r['id'],'reason':'与小车08同位的组合符号，不重复放置不确定的托架'})
 elif r['layer']=='M-大车':
  mastRails.append(r)
 elif name=='飞梯俯视002':
  mastEndpoints.append(r)
 elif r['depth']==0 and name in ['JL1000Y','ZFS','KXF','DYF']:
  p=base(r,'cad-'+name.lower(),'process-shape')
  if name in ['JL1000Y','ZFS']:p['height']=1.1 if name=='JL1000Y' else .88
  else:p['surfaceHeight']=.8
  p['deviceLabel']={'KXF':'智狼输送线 KXF','DYF':'智狼入库线 DYF','JL1000Y':'安全门','ZFS':'操作台'}[name]
  p['status']='shape-approved-process-unconfirmed';p['basis']='用户确认按 CAD 原图形态重建；典型智狼库参考图辅助判断，不指定工艺用途'
  p['processUse']='unconfirmed'
  if name=='KXF':p['status']='user-confirmed-conveyor-with-bins';p['basis']='用户确认 KXF 为输送线配料箱；采用独立智狼入库线 GLB 结构，保留 CAD 外轮廓，流向未定'
  placements.append(p)
# User confirmed: the two drawn positions represent one Zhilang mast per aisle.
# The 52 mm strip is its rail, never an additional physical vehicle.
rows=collections.defaultdict(list)
for r in mastEndpoints:rows[round(r['center'][1]*.001,3)].append(r)
for y,ends in sorted(rows.items()):
 assert len(ends)==2
 left,right=sorted(ends,key=lambda r:r['center'][0]);p=base(left,'zhilang-mast-campus','zhilang-mast')
 p.update(height=10.8,yaw=0,deviceLabel='智狼大车',status='user-confirmed-13-vehicles',sourcePaths=[left['id'],right['id']],travelLength=(right['center'][0]-left['center'][0])*.001,basis='用户确认：每巷道两图为同一台智狼大车的两端位置，共 13 台；钢架沿货架行走，载体嵌套升降')
 p['motion']={'kind':'shuttle','axis':[1,0,0],'distance':p['travelLength'],'duration':32}
 rail=min(mastRails,key=lambda r:abs(r['center'][1]-left['center'][1]));p['railSourcePath']=rail['id'];placements.append(p)
 excluded.append({'id':right['id'],'reason':'用户确认的同台智狼大车另一端位，合并到 '+p['id']})
for r in mastRails:excluded.append({'id':r['id'],'reason':'大车轨道线，不另外生成车辆'})
assert len(rows)==13
# Duplicate workstation nested views are one physical station.
stationSeen=set();unique=[]
for p in placements:
 key=(p['role'],round(p['position'][0],2),round(p['position'][2],2))
 if p['role']=='station' and key in stationSeen:
  excluded.append({'id':p['sourcePath'],'reason':'顶层与嵌套工作站在同一位置，合并一次'});continue
 stationSeen.add(key);unique.append(p)
placements=unique
# Multiple 3-bin / 4-bin diagrams overlap at edge bays. Model one footprint,
# retain the authoring ambiguity in the review report rather than double-stacking.
used=set()
for i,r in enumerate(binrows):
 if i in used:continue
 group=[r];p0=box(*[r['bbox'][0][0],r['bbox'][0][1],r['bbox'][1][0],r['bbox'][1][1]])
 for j,s in enumerate(binrows[i+1:],i+1):
  if j in used:continue
  p1=box(s['bbox'][0][0],s['bbox'][0][1],s['bbox'][1][0],s['bbox'][1][1])
  if p0.intersection(p1).area/min(p0.area,p1.area)>.85:
   used.add(j);group.append(s)
 if len(group)>1:review.append({'id':r['id'],'related':[s['id'] for s in group[1:]],'reason':'同一位置 3/4 箱位图块重叠，按共同外轮廓生成一组结构，容量待工艺核对'})
 r=max(group,key=lambda q:math.prod(q['localSize']));p=base(r,'bin-rack-double' if '双排' in r['layer'] else 'bin-rack-single','bin-rack');p['levels']=18;p['height']=10.8;p['yaw']+=90;p['size'].reverse();p['columns']=4 if '4箱' in r['layer'] else 3;placements.append(p)

# Four-way aisle rails are explicitly distinct from the storage cells.
rails=[]
for r in inv['inserts']:
 if r['layer']=='001四向车货架' and r['dyn'] in ['*U136','*U128']:
  p=xy(r['center']);b=building(r);w,d=[v*.001 for v in r['size'][:2]]
  if b:rails.append({'id':'rail-'+r['handle'],'building':b,'center':p,'size':[w,d],'levels':[.24,2.24,4.24,6.24]})

# Surfaces use the actual campus boundary and vegetation polygons, not an
# unbounded background plane. The main internal carriageways are simplified.
green=unary_union(greens).difference(unary_union(list(buildingPolys.values())))
routes=[([[497.64,365.85],[497.64,941.85]],9),([[190,596.85],[497.64,596.85]],12),([[252,707.35],[497.64,707.35]],9),([[287,830.85],[497.64,830.85]],12),([[170,365.85],[497.64,365.85]],10),([[329,946.35],[488,946.35],[497.64,937]],9),([[170,390],[170,500],[192,585],[220,605],[236,692],[252,707.35],[285,810],[285,830],[292,856],[322,931],[329,946.35]],9)]
buildingUnion=unary_union(list(buildingPolys.values()))
bridge=box(50.14,-33.143,67.14,-25.143)
roadRaw=unary_union([LineString([[x-330,y-660] for x,y in pts]).buffer(width/2,resolution=12,cap_style=2,join_style=1) for pts,width in routes])
# Catch a wrongly routed centreline before subtraction could hide the mistake.
assert roadRaw.intersection(buildingUnion).area<1e-6,'Road corridor crosses a building'
internal=roadRaw.intersection(boundary).difference(green).difference(buildingUnion.buffer(.35)).difference(bridge)
clip=rect(22,290,710,1000)
public=[]
west=LineString([[56.9-330,355-660],[299.0-330,1000-660]]).buffer(17,cap_style=2)
south=LineString([[70-330,318.6-660],[700-330,316.2-660]]).buffer(17,cap_style=2)
highway=[e for e in geom if e['source']=='9CED5' and e['layer']=='高速' and len(e['points'])>10]
east=Polygon([xy(p) for p in highway[0]['points']]+[xy(p) for p in reversed(highway[1]['points'])]).buffer(0).intersection(clip)
public=unary_union([west,south,east]).intersection(clip).difference(boundary).difference(buildingUnion.buffer(.35))
hardscape=boundary.difference(unary_union([internal,green,buildingUnion,bridge]))
def lineparts(g):
 if g.is_empty:return []
 if g.geom_type=='LineString':return [[[round(x,4),round(y,4)] for x,y in g.coords]]
 return [p for part in getattr(g,'geoms',[]) for p in lineparts(part)]
curbSource=[]
for e in geom:
 if e['layer']=='ROAD' and (e['source']=='9CED5' or e['source'] in ['2810','2815','2817','269A']):
  pts=[xy(p) for p in e['points']]
  if e['closed'] and pts[0]!=pts[-1]:pts.append(pts[0])
  if len(pts)>1:curbSource.append(set_precision(LineString(pts),.01))
curbs=[{'points':p,'closed':False} for p in lineparts(unary_union(curbSource).difference(buildingUnion.buffer(.4)))]
trees=[];rng=random.Random(261026)
for x in range(math.floor(green.bounds[0]),math.ceil(green.bounds[2]),7):
 for y in range(math.floor(green.bounds[1]),math.ceil(green.bounds[3]),7):
  point=Point(x+rng.uniform(-1.3,1.3),y+rng.uniform(-1.3,1.3))
  if green.buffer(-1.5).contains(point):trees.append([round(point.x,3),round(point.y,3),round(rng.uniform(3.5,5.2),2)])
markings=[]
for e in geom:
 if e['source']=='9CED5' and e['layer']=='PKNG-TSRP':
  pts=[xy(p) for p in e['points']]
  if len(pts)>1:markings.extend(lineparts(LineString(pts).intersection(hardscape.buffer(-.1))))
roadPaint=[]
for pts in [[[x-330,y-660] for x,y in pts] for pts,width in routes]+[[[-273.1,-305],[-31,340]],[[-260,-341.4],[370,-343.8]]]:
 roadPaint.extend(lineparts(LineString(pts).intersection(unary_union([internal,public]).buffer(-.15))))
surfaces={'hardscape':hardscape,'roads':internal,'greens':green,'publicRoads':public}
surfaceChecks={a+' / '+b:round(s.intersection(t).area,8) for a,s in surfaces.items() for b,t in surfaces.items() if a<b}
surfaceChecks['roads / buildings']=round(internal.intersection(buildingUnion).area,8)
surfaceChecks['raw road corridor / buildings']=round(roadRaw.intersection(buildingUnion).area,8)
assert max(surfaceChecks.values())<1e-6,surfaceChecks

def record_path(p):
 x,_,z=p['position'];cy=-z
 # Existing fleet at the east/south perimeter travels along verified clear
 # lanes. Station queues remain parked; no extra fleet is invented.
 if p['asset']=='agv-zhilang' and x>144 and 2<cy<33:
  p['motion']={'kind':'shuttle','axis':[0,0,1],'distance':.65,'duration':9.0}
 elif p['asset']=='agv-zhilang' and -3.8<cy<2.5 and 118<x<143:
  p['motion']={'kind':'shuttle','axis':[1,0,0],'distance':.32,'duration':8.0}
 elif p['role']=='zhilang-mast':pass # Calibrated end positions above own travel.
for p in placements:record_path(p)
counts=collections.Counter(p['role'] for p in placements);capacities={}
for b in ['2','5','6']:
 capacities[b]={'beamSlots':sum(p['levels']*2 for p in placements if p['building']==b and p['role']=='beam-rack'),'denseSlots':sum(p['levels'] for p in placements if p['building']==b and p['role']=='dense-rack')}
assert capacities['2']['beamSlots']==3520 and capacities['2']['denseSlots']==2420
assert capacities['6']['beamSlots']==1088 and capacities['6']['denseSlots']==2688
assert capacities['5']['beamSlots']==1088
layout={'version':'1.1.0','source':Path(inv['source']).name,'sourceSha256':inv['sha256'],'originDXF':ORIGIN,'units':'m','buildings':buildings,'placements':placements,'rails':rails,'site':{'boundary':shape(boundary),'hardscape':shape(hardscape),'greens':shape(green),'roads':shape(internal),'publicRoads':shape(public),'curbs':curbs,'parking':markings,'trees':trees,'roadCenterlines':roadPaint,'surfaceOverlapAreaM2':surfaceChecks},'occupancy':1,'displayParameters':{'palletRack4Height':8,'palletRack5Height':10,'binRack18Height':10.8,'conveyorSurfaceHeight':.8,'confirmation':'用户已确认展示高度；最新指令改为满货'},'counts':dict(counts),'capacityChecks':capacities,'reviewCount':len(review),'duplicatesRemoved':excluded}
(DIST/'data/layout.json').write_text(json.dumps(layout,ensure_ascii=False,separators=(',',':')))
(OUT/'placements.json').write_text(json.dumps(placements,ensure_ascii=False,indent=2));(OUT/'待核对事项.json').write_text(json.dumps(review,ensure_ascii=False,indent=2))
with (OUT/'设备识别清单.csv').open('w',encoding='utf-8-sig',newline='') as f:
 w=csv.writer(f);w.writerow(['ID','仓库','类型','GLB资产','CAD块路径','图层','X_m','Y_m','Z_m','旋转_deg','依据'])
 for p in placements:w.writerow([p['id'],p['building'],p['role'],p['asset'],p['sourcePath'],p['layer'],*p['position'],p['yaw'],p['basis']])
print(json.dumps({'buildings':len(buildings),'warehouseBuildings':7,'counts':dict(counts),'capacityChecks':capacities,'trees':len(trees),'reviewCount':len(review),'deduplicated':excluded,'glbAssets':sorted(set(p['asset'] for p in placements))},ensure_ascii=False,indent=2))
