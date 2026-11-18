import os,json,math
os.environ['MPLCONFIGDIR']='/private/tmp/campus-mpl-cache'
import ezdxf
from ezdxf.path import make_path
from ezdxf.entities.copy import default_copy
default_copy.settings=default_copy.settings._replace(copy_extension_dict=False,copy_xdata=False,copy_appdata=False)
import matplotlib;matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
d=ezdxf.readfile(ROOT/'input.dxf')
fig,axes=plt.subplots(1,4,figsize=(16,7));data=[]
for ax,handle in zip(axes,['390C69','390C6A','390C6B','390C8E']):
 root=d.entitydb[handle];texts=[];paths=[]
 def walk(es):
  for e in es:
   if e.dxftype()=='INSERT':walk(e.virtual_entities());continue
   if e.dxftype() in ['TEXT','MTEXT','ATTDEF']:texts.append(getattr(e.dxf,'text','') if e.dxftype()!='MTEXT' else e.text);continue
   try:
    pts=[(v.x*.001,v.y*.001) for v in make_path(e).flattening(5)]
    if len(pts)>1:paths.append(pts)
   except (TypeError,ValueError,AttributeError):pass
 walk(root.virtual_entities());ax.add_collection(LineCollection(paths,linewidths=.7,colors='#333'));ax.autoscale();ax.set_aspect('equal');ax.set_title(root.dxf.name+' / '+root.dxf.layer);ax.grid(alpha=.1);data.append({'handle':handle,'block':root.dxf.name,'texts':texts})
fig.tight_layout();fig.savefig(ROOT/'输出/识图确认/辅助设备原始图块.png',dpi=150);print(json.dumps(data,ensure_ascii=False))
