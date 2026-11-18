import json,hashlib,argparse
from pathlib import Path

def validate(root):
 from cad_mapping import connect, validate as validate_mapping
 db=connect(seed=root/'assets/cad-mapping/cad_mapping_v0_1.sql')
 try: mapping_report=validate_mapping(db)
 finally: db.close()
 counts={'cad_mapping':mapping_report['counts']}
 for rel in ['assets/asset-library-high','assets/campus-example/dist/library']:
  base=root/rel;catalog=json.loads((base/'manifest.json').read_text());seen=set()
  for a in catalog['assets']:
   assert a['id'] not in seen,a['id'];seen.add(a['id'])
   for key in ['model','spec']:
    p=(base/a[key]).resolve();assert base.resolve() in p.parents and p.is_file(),p
   assert hashlib.sha256((base/a['model']).read_bytes()).hexdigest()==a['modelSha256'],a['id']
   spec=json.loads((base/a['spec']).read_text());assert spec['id']==a['id'] and spec['modelSha256']==a['modelSha256']
  counts[rel]=len(seen)
 for p in root.rglob('*'):
  assert not p.is_symlink(),p
  if p.is_file() and p.suffix in ['.py','.js','.mjs','.json','.md','.html']:
   assert ('/'+'Users/') not in p.read_text(errors='replace'),str(p)+' contains host path'
 layout=json.loads((root/'assets/campus-example/dist/data/layout.json').read_text());ids={a['id'] for a in json.loads((root/'assets/campus-example/dist/library/manifest.json').read_text())['assets']}
 assert all(p['asset'] in ids for p in layout['placements'])
 return counts
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('root',nargs='?',default=str(Path(__file__).resolve().parents[1]));args=p.parse_args();print(json.dumps(validate(Path(args.root).resolve()),ensure_ascii=False))
