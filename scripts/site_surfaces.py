"""Partition confirmed metre-based GeoJSON geometries; not a CAD recognizer."""
import argparse,json
from pathlib import Path
from shapely.geometry import shape,GeometryCollection
from shapely.ops import unary_union

def partition(data):
 get=lambda k:shape(data[k]).buffer(0) if k in data else GeometryCollection()
 boundary=get('boundary');buildings=get('buildings');public=get('publicRoads').difference(buildings)
 roads=get('roads').intersection(boundary).difference(unary_union([buildings,public]))
 greens=get('greens').intersection(boundary).difference(unary_union([buildings,public,roads]))
 hard=boundary.difference(unary_union([buildings,public,roads,greens]))
 parts={'publicRoads':public,'roads':roads,'greens':greens,'hardscape':hard}
 def rings(g):
  if g.is_empty:return []
  if g.geom_type=='Polygon':return [{'outer':list(g.exterior.coords),'holes':[list(r.coords) for r in g.interiors]}]
  return [p for x in getattr(g,'geoms',[]) for p in rings(x)]
 checks={a+'-'+b:x.intersection(parts[b]).area for a,x in parts.items() for b in parts if a<b}
 checks.update({a+'-buildings':x.intersection(buildings).area for a,x in parts.items()})
 assert max(checks.values(),default=0)<1e-6
 return {**{k:rings(v) for k,v in parts.items()},'surfaceOverlapAreaM2':checks}
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('input');p.add_argument('--out',required=True);a=p.parse_args();Path(a.out).write_text(json.dumps(partition(json.loads(Path(a.input).read_text())),ensure_ascii=False))
