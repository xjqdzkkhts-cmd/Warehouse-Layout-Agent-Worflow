import json, math, os
os.environ['MPLCONFIGDIR']='/private/tmp/campus-mpl-cache'
import matplotlib;matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as Patch
from shapely.geometry import box
from shapely.affinity import rotate,translate
l=json.load(open('dist/data/layout.json'));fig,ax=plt.subplots(figsize=(14,11))
for p in l['placements']:
 if p['building']!='5':continue
 x,_,z=p['position'];w,d=p['size'];role=p['role']
 if role=='agv':ax.scatter(x,-z,s=5,c='red');continue
 if role=='zhilang-mast':w,d=1.05,.60
 if role=='aux-lift':w,d=.72,.58
 poly=translate(rotate(box(-w/2,-d/2,w/2,d/2),p['yaw'],origin=(0,0)),x,-z)
 ax.add_patch(Patch(list(poly.exterior.coords),alpha=.5,facecolor={'bin-rack':'#689acb','station':'#da9e50','beam-rack':'#969c90'}.get(role,'#a34d89')))
ax.set(xlim=(67,157),ylim=(-34,37),aspect='equal');ax.set_xticks(range(67,158,5));ax.set_yticks(range(-33,38,5));ax.grid();fig.savefig('输出/识图确认/导航通道检查.png',dpi=130)
