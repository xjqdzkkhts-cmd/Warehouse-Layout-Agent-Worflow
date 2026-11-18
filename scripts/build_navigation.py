"""CAD-derived conservative navigation grid; model swept footprints, not pixels."""
import json,math,hashlib
from pathlib import Path
from collections import deque
from shapely.geometry import box,Point,LineString
from shapely.affinity import rotate,translate
from shapely.ops import unary_union
from shapely.prepared import prep
import sys
path=Path(sys.argv[1]).resolve();config=json.loads(Path(sys.argv[2]).read_text());ROOT=path.parents[2];layout=json.loads(path.read_text());building=config['building'];xmin,zmin,xmax,zmax=config['bounds'];step=config['cellSize']
vehicles=[p for p in layout['placements'] if p['role']=='agv' and p['building']==building];obstacles=[]
for p in layout['placements']:
 if p['building']!=building or p['role']=='agv':continue
 x,_,z=p['position'];w,d=p['size']
 if p['role']=='zhilang-mast':
  w,d=p['size'][0]+p['motion']['distance'],p['size'][1];x+=p['motion']['distance']/2
 obstacle=translate(rotate(box(-w/2,-d/2,w/2,d/2),-p['yaw'],origin=(0,0)),x,z)
 obstacles.append(obstacle)
obstacle=unary_union(obstacles);radius=config['bodyClearanceRadius'];blocked=obstacle.buffer(radius);free=box(xmin,zmin,xmax,zmax).difference(blocked);prepared=prep(free)
points=[];indices={}
for iy in range(math.floor((zmax-zmin)/step)+1):
 for ix in range(math.floor((xmax-xmin)/step)+1):
  x,z=xmin+ix*step,zmin+iy*step
  if prepared.covers(Point(x,z)):indices[(ix,iy)]=len(points);points.append([round(x,5),round(z,5)])
neighbors=[[] for _ in points]
for (ix,iy),i in indices.items():
 for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)]:
  j=indices.get((ix+dx,iy+dy))
  if j is not None and prepared.covers(LineString([points[i],points[j]])):neighbors[i].append(j)
# Use only the main connected aisle network.
components=[];seen=set()
for i in range(len(points)):
 if i in seen:continue
 queue=deque([i]);component=[];seen.add(i)
 while queue:
  q=queue.popleft();component.append(q)
  for j in neighbors[q]:
   if j not in seen:seen.add(j);queue.append(j)
 components.append(component)
component=max(components,key=len);remap={old:i for i,old in enumerate(component)}
points=[points[i] for i in component];neighbors=[[remap[j] for j in neighbors[i] if j in remap] for i in component]
goals=list(range(len(points)))
if config.get('goals'):
 goals=sorted(set(min(range(len(points)),key=lambda i:(points[i][0]-g[0])**2+(points[i][1]-g[1])**2) for g in config['goals']))
occupied=set();starts=[]
for p in sorted(vehicles,key=lambda p:p['id']):
 x,_,z=p['position'];candidates=sorted(range(len(points)),key=lambda i:(points[i][0]-x)**2+(points[i][1]-z)**2)
 start=next(i for i in candidates if i not in occupied);occupied.add(start);sx,sz=points[start]
 starts.append({'id':p['id'],'node':start,'cadPosition':[x,z],'displayStart':[sx,sz],'adjustmentM':round(math.hypot(sx-x,sz-z),4)})
 p['motion']={'kind':'navigation','start':start,'speed':config['speed'],'turnRate':2.2}
assert all(obstacle.distance(Point(p))>=radius-1e-6 for p in points)
assert len(set(s['node'] for s in starts))==len(vehicles)
references=layout.get('navigation',{}).get('referenceFiles',{})
layout['navigation']={'building':building,'points':points,'neighbors':neighbors,'goals':goals,'cellSize':step,'bodyClearanceRadius':radius,'nominalSpeed':config['speed'],'referenceFiles':references,'policy':'4-neighbour A*, reserve both old/new cells, stop and rotate on shortest angle before entering new heading, interpolate in metres/seconds; CAD fleet starts snapped to unique clear cells'}
path.write_text(json.dumps(layout,ensure_ascii=False,separators=(',',':')))
report={'vehicles':len(starts),'nodes':len(points),'goals':len(goals),'clearanceRadius':radius,'gridSpacing':step,'roadOverlapAreaM2':layout['site']['surfaceOverlapAreaM2'],'starts':starts,'maxStartAdjustmentM':max((s['adjustmentM'] for s in starts),default=0),'note':'CAD vehicle symbols represent suggested parking poses; demo starts use nearby distinct driveable cells. Not a production traffic controller.'}
(ROOT/'输出/识图确认').mkdir(parents=True,exist_ok=True)
(ROOT/'输出/识图确认/导航验证.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='starts'},ensure_ascii=False,indent=2))
