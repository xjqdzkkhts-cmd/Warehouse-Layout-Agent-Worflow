import sys,json,collections,math,hashlib,os
from pathlib import Path
os.environ.setdefault('MPLCONFIGDIR',str(Path(__import__('tempfile').gettempdir())/'cad-web-mpl-cache'))
import ezdxf
from ezdxf import bbox,disassemble,path as dpath
from ezdxf.math import Vec3
sys.path.insert(0,str(Path(__file__).resolve().parent))
from dxf_inventory import dyn_name
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'输出/识图确认/_过程'
SOURCE=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else ROOT/'input.dxf'
OUT.mkdir(parents=True,exist_ok=True)
doc=ezdxf.readfile(SOURCE);ms=doc.modelspace();cache=bbox.Cache();blocks={};rows=[]
def bbvalue(b):return [list(b.extmin),list(b.extmax)] if b.has_data else None
def trow(e):
 return {'text':e.plain_text() if e.dxftype()=='MTEXT' else e.dxf.text,'xy':list(e.dxf.insert)[:2],'height':e.dxf.char_height if e.dxftype()=='MTEXT' else e.dxf.height,'layer':e.dxf.layer}
used=collections.Counter(e.dxf.name for e in ms.query('INSERT'))
for name,count in used.items():
 b=doc.blocks[name];bb=bbox.extents(b,fast=True,cache=cache)
 blocks[name]={'count':count,'dynamic':dyn_name(doc,name),'bbox':bbvalue(bb),'base':list(b.block.dxf.base_point),'layers':dict(collections.Counter(e.dxf.layer for e in b)),'types':dict(collections.Counter(e.dxftype() for e in b)),'nested':dict(collections.Counter(e.dxf.name for e in b.query('INSERT'))),'texts':[trow(e) for e in disassemble.recursive_decompose(b) if e.dxftype() in ['TEXT','MTEXT']]}
for e in ms.query('INSERT'):
 name=e.dxf.name;b=blocks[name]['bbox']
 if not b:continue
 matrix=e.matrix44();corners=[matrix.transform(Vec3(x,y,z)) for x in (b[0][0],b[1][0]) for y in (b[0][1],b[1][1]) for z in (b[0][2],b[1][2])];bb=bbox.BoundingBox(corners)
 rows.append({'handle':e.dxf.handle,'block':name,'dyn':blocks[name]['dynamic'],'layer':e.dxf.layer,'insert':list(e.dxf.insert),'rotation':e.dxf.rotation,'scale':[e.dxf.xscale,e.dxf.yscale,e.dxf.zscale],'bbox':bbvalue(bb),'center':list(bb.center),'size':list(bb.size),'texts':[trow(t) for t in disassemble.recursive_decompose([e]) if t.dxftype() in ['TEXT','MTEXT']] if max(bb.size)>20000 else []})
inventory={'source':SOURCE.name,'sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'units':doc.units,'blocks':blocks,'inserts':rows,'texts':[trow(e) for e in ms if e.dxftype() in ['TEXT','MTEXT']]}
(OUT/'inventory.json').write_text(json.dumps(inventory,ensure_ascii=False))
geometry=[]
for original in ms:
 if original.dxftype() in ('DIMENSION','TEXT','MTEXT','ACAD_PROXY_ENTITY'):continue
 if original.dxftype()=='INSERT':
  r=next((r for r in rows if r['handle']==original.dxf.handle),None)
  if not r or max(r['size'])<12000:continue
 for e in disassemble.recursive_decompose([original]):
  if e.dxftype() in ('TEXT','MTEXT','DIMENSION','ACAD_PROXY_ENTITY','ATTRIB','ATTDEF','SOLID'):continue
  try:
   paths=list(dpath.from_hatch(e)) if e.dxftype()=='HATCH' else [dpath.make_path(e)]
   for p in paths:
    points=[[round(v.x,3),round(v.y,3)] for v in p.flattening(80)]
    if len(points)<2:continue
    geometry.append({'source':original.dxf.handle,'layer':e.dxf.layer,'type':e.dxftype(),'closed':p.is_closed,'points':points})
  except (TypeError,ValueError,AttributeError,NotImplementedError):pass
(OUT/'geometry.json').write_text(json.dumps(geometry,ensure_ascii=False,separators=(',',':')))
print(json.dumps({'units':doc.units,'inserts':len(rows),'blocks':len(blocks),'geometries':len(geometry),'largeBlocks':[{k:r[k] for k in ['handle','block','layer','center','size','rotation']} for r in rows if max(r['size'])>20000]},ensure_ascii=False,indent=2))
