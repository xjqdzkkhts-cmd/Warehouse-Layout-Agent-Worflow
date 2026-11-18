import os,json,collections,re,math
from pathlib import Path
os.environ['MPLCONFIGDIR']='/private/tmp/campus-mpl-cache'
import matplotlib;matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
plt.rcParams['font.sans-serif']=['Arial Unicode MS','PingFang SC']
p=Path(__file__).resolve().parents[1]/'输出/识图确认';m=json.loads((p/'_过程/inventory.json').read_text());g=json.loads((p/'_过程/geometry.json').read_text())
def decode(t):return re.sub(r'\\U\+([0-9A-Fa-f]{4})',lambda m:chr(int(m[1],16)),t)
colors={'0-绿化':'#57935b','RD-红线':'#bd4646','0-新建建筑':'#303f5c','0-室外场地':'#aaa184','ROAD':'#777777','RD-侧石线':'#aaa','高速':'#555','RD-中线':'#aaa','0-围墙':'#444'}
fig,ax=plt.subplots(figsize=(16,20));
for layer,c in colors.items():
 paths=[[[x*.001,y*.001] for x,y in e['points']] for e in g if e['layer']==layer]
 ax.add_collection(LineCollection(paths,colors=c,linewidths=1))
 print(layer,[(e['source'],e['type'],len(e['points']),[[round(min(v[i] for v in e['points'])),round(max(v[i] for v in e['points']))] for i in range(2)]) for e in g if e['layer']==layer][:45])
for r in m['inserts']:
 if r['layer']=='001单体库房':
  b=r['bbox'];ax.text(r['center'][0]*.001,r['center'][1]*.001,r['handle'],fontsize=12,color='#c43939')
 if r['layer']=='001园区总图':
  for t in r['texts']:
   text=decode(t['text'])
   if '#' in text or '出入口' in text or 'H=' in text:ax.text(t['xy'][0]*.001,t['xy'][1]*.001,text,fontsize=7)
ax.set(xlim=(70,600),ylim=(300,1000),aspect='equal');ax.grid(alpha=.1);fig.savefig(p/'园区CAD总图.png',dpi=140,bbox_inches='tight')
fig,ax=plt.subplots(figsize=(16,17))
paths=[[[x*.001,y*.001] for x,y in e['points']] for e in g if e['layer'] in ['WALL','COLUMN','WALL-MOVE'] and e['source']!='9CED5']
ax.add_collection(LineCollection(paths,colors='#666666',linewidths=.35))
for r in m['inserts']:
 if r['layer']=='001单体库房' or r['layer']=='001园区总图':continue
 b=r['bbox'];x0,y0=b[0][:2];x1,y1=b[1][:2]
 if not(180000<r['center'][0]<500000 and 380000<r['center'][1]<710000):continue
 c='#4683b5' if '货架' in r['layer'] else '#b26b39' if '输送' in r['layer'] else '#b73b64' if r['layer']=='M-小车' else '#777'
 ax.add_patch(plt.Rectangle((x0*.001,y0*.001),(x1-x0)*.001,(y1-y0)*.001,fill=False,lw=.6,edgecolor=c))
for t in m['texts']:
 if t['height']>500:ax.text(t['xy'][0]*.001,t['xy'][1]*.001,decode(t['text']),fontsize=6)
ax.set(xlim=(185,495),ylim=(390,705),aspect='equal');ax.grid(alpha=.1);fig.savefig(p/'仓库CAD设备分布.png',dpi=160,bbox_inches='tight')
