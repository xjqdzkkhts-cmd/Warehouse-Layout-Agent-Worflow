import json,math
from pathlib import Path
from shapely.geometry import box
from shapely.affinity import rotate,translate
from shapely.ops import unary_union
l=json.load(open('dist/data/layout.json'));racks=[]
for p in l['placements']:
 if p['building']!='5' or p['role'] not in ['bin-rack','beam-rack']:continue
 x,_,z=p['position'];w,d=p['size'];racks.append(translate(rotate(box(-w/2,-d/2,w/2,d/2),-p['yaw'],origin=(0,0)),x,z))
obstacles=unary_union(racks);checks=[]
for p in l['placements']:
 if p['role']!='zhilang-mast':continue
 x,_,z=p['position'];w,d=p['size'];sweep=box(x-w/2,z-d/2,x+p['motion']['distance']+w/2,z+d/2)
 area=sweep.intersection(obstacles).area;assert area<1e-6,(p['id'],area)
 checks.append({'id':p['id'],'sourcePositions':p['sourcePaths'],'travelM':p['motion']['distance'],'rackOverlapM2':area,'minimumRackClearanceM':sweep.distance(obstacles)})
Path('mast-validation.json').write_text(json.dumps({'count':len(checks),'checks':checks},indent=2));print('13 mast swept footprints do not overlap rack footprints; min clearance',min(c['minimumRackClearanceM'] for c in checks))
