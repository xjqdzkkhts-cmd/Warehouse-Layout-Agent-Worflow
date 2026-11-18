import json,logging,collections,sys,math
from pathlib import Path
import ezdxf
from ezdxf import bbox
from ezdxf.math import Matrix44,Vec3
from ezdxf.entities.copy import default_copy
# Extension dictionaries are authoring metadata, not evaluated geometry.
# Skip their virtual-copy work without altering the source document/file.
default_copy.settings=default_copy.settings._replace(copy_extension_dict=False,copy_xdata=False,copy_appdata=False)
logging.getLogger('ezdxf').setLevel(logging.ERROR)
p=Path(__file__).resolve().parents[1];out=p/'输出/识图确认/_过程'
out.mkdir(parents=True,exist_ok=True)
doc=ezdxf.readfile(Path(sys.argv[1]).resolve() if len(sys.argv)>1 else p/'input.dxf');cache=bbox.Cache();boxes={};records=[]
def blockbox(name):
 if name not in boxes:
  b=bbox.extents(doc.blocks[name],fast=True,cache=cache);boxes[name]=[list(b.extmin),list(b.extmax)] if b.has_data else None
 return boxes[name]
def walk(e,parent,chain,toplayer,depth=0):
 name=e.dxf.name;m=Matrix44.chain(e.matrix44(),parent);b=blockbox(name)
 if b:
  points=[m.transform(Vec3(x,y,z)) for x in (b[0][0],b[1][0]) for y in (b[0][1],b[1][1]) for z in (b[0][2],b[1][2])];bb=bbox.BoundingBox(points);origin=m.transform(Vec3());vx=m.transform_direction(Vec3(1,0,0));vy=m.transform_direction(Vec3(0,1,0))
  records.append({'id':'/'.join(chain+[e.dxf.handle]),'handle':e.dxf.handle,'topHandle':chain[0] if chain else e.dxf.handle,'block':name,'topLayer':toplayer,'layer':e.dxf.layer,'depth':depth,'center':list(bb.center),'bbox':[list(bb.extmin),list(bb.extmax)],'localSize':[(b[1][0]-b[0][0])*vx.magnitude,(b[1][1]-b[0][1])*vy.magnitude],'yaw':math.degrees(math.atan2(vx.y,vx.x)),'childInserts':len(doc.blocks[name].query('INSERT')),'types':dict(collections.Counter(n.dxftype() for n in doc.blocks[name])),'layers':dict(collections.Counter(n.dxf.layer for n in doc.blocks[name])),'texts':[n.plain_text() if n.dxftype()=='MTEXT' else n.dxf.text for n in doc.blocks[name] if n.dxftype() in ['MTEXT','TEXT']]})
 for child in doc.blocks[name].query('INSERT'):walk(child,m,chain+[e.dxf.handle],toplayer,depth+1)
for e in doc.modelspace().query('INSERT'):
 if e.dxf.layer in ['001单体库房','001园区总图']:continue
 walk(e,Matrix44(),[],e.dxf.layer)
(out/'device-nodes.json').write_text(json.dumps(records,ensure_ascii=False,separators=(',',':')))
for top in ['10DEB3','390D62','390D63','390DAD','390C4E','390D7C','390D83']:
 r=[r for r in records if r['topHandle']==top]
 if r:print(top,len(r),collections.Counter((x['depth'],x['block']) for x in r).most_common(18))
print('COUNT',len(records))
