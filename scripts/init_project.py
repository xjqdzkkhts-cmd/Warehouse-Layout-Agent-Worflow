"""Create an independent workspace; explicit --example or confirmed --layout required."""
import argparse,json,shutil
from pathlib import Path
from validate_bundle import validate
p=argparse.ArgumentParser(description=__doc__);p.add_argument('destination');g=p.add_mutually_exclusive_group(required=True);g.add_argument('--example',action='store_true');g.add_argument('--layout',type=Path);a=p.parse_args()
root=Path(__file__).resolve().parents[1];dest=Path(a.destination).expanduser().resolve()
if dest.exists() and any(dest.iterdir()):p.error('Destination must be empty')
if root==dest or root in dest.parents or dest in root.parents:p.error('Destination must be outside the skill')
validate(root)
if a.layout:
 layout=json.loads(a.layout.read_text());available={x['id'] for rel in ['asset-library-high','campus-example/dist/library'] for x in json.loads((root/'assets'/rel/'manifest.json').read_text())['assets']}
 missing={o['asset'] for o in layout['placements']}-available
 if missing:p.error('Generate missing derived assets first: '+str(sorted(missing)))
 for key in ['site','buildings','placements','rails','occupancy']:assert key in layout,key
shutil.copytree(root/'assets/cad-mapping',dest/'cad-mapping')
for lib in ['asset-library-high']:shutil.copytree(root/'assets'/lib,dest/lib)
shutil.copytree(root/'assets/campus-example',dest/'project')
if a.layout:
 project=dest/'project';shutil.copytree(root/'assets/runtime-template',project/'dist',dirs_exist_ok=True)
 (project/'dist/data/layout.json').write_text(json.dumps(layout,ensure_ascii=False,separators=(',',':')))
 catalog=json.loads((project/'dist/library/manifest.json').read_text());known={x['id'] for x in catalog['assets']}
 wanted={o['asset'] for o in layout['placements']}
 for lib in ['asset-library-high']:
  source=dest/lib
  for item in json.loads((source/'manifest.json').read_text())['assets']:
   if item['id'] in wanted:
    for key in ['model','spec']:shutil.copy2(source/item[key],project/'dist/library'/item[key])
    catalog['assets']=[old for old in catalog['assets'] if old['id']!=item['id']]
    catalog['assets'].append(item);known.add(item['id'])
 (project/'dist/library/manifest.json').write_text(json.dumps(catalog,ensure_ascii=False))
 (project/'NEW-PROJECT.md').write_text('已接入用户确认的布局。tools 中园区识图映射和数量验收仍是案例，须按新图替换，不能直接运行冒充新项目识图。先完成实际几何与浏览器验收，再发布。')
print(json.dumps({'project':str(dest/'project'),'mode':'example' if a.example else 'confirmed-layout','preview':'python3 -m http.server 5184 --directory dist'},ensure_ascii=False))
