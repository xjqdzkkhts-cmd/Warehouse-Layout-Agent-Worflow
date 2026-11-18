"""CAD-derived conservative navigation grid; model swept footprints, not pixels."""
import json,math,hashlib
from pathlib import Path
from collections import deque
from shapely.geometry import box,Point,LineString
from shapely.affinity import rotate,translate
from shapely.ops import unary_union
from shapely.prepared import prep
ROOT=Path(__file__).resolve().parents[1];path=ROOT/'dist/data/layout.json';layout=json.loads(path.read_text())
vehicles=[p for p in layout['placements'] if p['role']=='agv'];obstacles=[]
for p in layout['placements']:
 if p['building']!='5' or p['role']=='agv':continue
 x,_,z=p['position'];w,d=p['size']
 if p['role']=='zhilang-mast':
  w,d=p['size'][0]+p['motion']['distance'],p['size'][1];x+=p['motion']['distance']/2
 obstacle=translate(rotate(box(-w/2,-d/2,w/2,d/2),-p['yaw'],origin=(0,0)),x,z)
 obstacles.append(obstacle)
obstacle=unary_union(obstacles);radius=.51;blocked=obstacle.buffer(radius);free=box(102,-35.4,153,6).difference(blocked);prepared=prep(free)
step=1.1;points=[];indices={}
for iy in range(38):
 for ix in range(47):
  x,z=102.1+ix*step,-35.2+iy*step
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
goals=[i for i,(x,z) in enumerate(points) if (145<x<151 and -32<z<-6) or (110<x<115 and -30<z<-2) or (112<x<150 and (z<-34 or z>4))]
occupied=set();starts=[]
for p in sorted(vehicles,key=lambda p:p['id']):
 x,_,z=p['position'];candidates=sorted(range(len(points)),key=lambda i:(points[i][0]-x)**2+(points[i][1]-z)**2)
 start=next(i for i in candidates if i not in occupied);occupied.add(start);sx,sz=points[start]
 starts.append({'id':p['id'],'node':start,'cadPosition':[x,z],'displayStart':[sx,sz],'adjustmentM':round(math.hypot(sx-x,sz-z),4)})
 p['motion']={'kind':'navigation','start':start,'speed':1.15,'turnRate':2.2}
assert all(obstacle.distance(Point(p))>=radius-1e-6 for p in points)
assert len(set(s['node'] for s in starts))==len(vehicles)
references=layout.get('navigation',{}).get('referenceFiles',{})
layout['navigation']={'building':'5','points':points,'neighbors':neighbors,'goals':goals,'cellSize':step,'bodyClearanceRadius':radius,'nominalSpeed':1.15,'referenceFiles':references,'policy':'4-neighbour A*, reserve both old/new cells, stop and rotate on shortest angle before entering new heading, interpolate in metres/seconds; CAD fleet starts snapped to unique clear cells'}
path.write_text(json.dumps(layout,ensure_ascii=False,separators=(',',':')))
report={'vehicles':len(starts),'nodes':len(points),'goals':len(goals),'clearanceRadius':radius,'gridSpacing':step,'roadOverlapAreaM2':layout['site']['surfaceOverlapAreaM2'],'starts':starts,'maxStartAdjustmentM':max(s['adjustmentM'] for s in starts),'note':'CAD vehicle symbols represent suggested parking poses; demo starts use nearby distinct driveable cells. Not a production traffic controller.'}
(ROOT/'输出/识图确认').mkdir(parents=True,exist_ok=True)
(ROOT/'输出/识图确认/导航验证.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='starts'},ensure_ascii=False,indent=2))
