import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as T from '../dist/library/vendor/three/build/three.module.js';
import {GLTFLoader} from '../dist/library/vendor/three/examples/jsm/loaders/GLTFLoader.js';
const base=new URL('../dist/',import.meta.url),layout=JSON.parse(await fs.readFile(new URL('data/layout.json',base))),manifest=JSON.parse(await fs.readFile(new URL('library/manifest.json',base)));
const placements=layout.placements.filter(p=>/^continuous-(roller|chain)/.test(p.asset)),rows=[],ray=new T.Raycaster();
assert.equal(placements.filter(p=>p.asset.startsWith('continuous-roller')).length,35);
assert.equal(placements.filter(p=>p.asset.startsWith('continuous-chain')).length,48);
let sampleCount=0,worstSurface=0;
for(const spec of manifest.assets.filter(s=>/^continuous-(roller|chain)/.test(s.id))){
  assert.equal(spec.quality,'high-derived');assert.equal(spec.surfaceHeight,.8);
  assert.ok(spec.reference.sources.every(s=>s.library==='asset-library-high'&&/^[a-f0-9]{64}$/.test(s.modelSha256)));
  const bytes=await fs.readFile(new URL('library/'+spec.model,base));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),spec.modelSha256);
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),''),root=gltf.scene;root.updateMatrixWorld(true);
  const b=new T.Box3().setFromObject(root,true),[W,L]=spec.placementFootprint;
  assert.ok(Math.abs(b.min.y)<.001,`${spec.id}: feet touch ground`);
  assert.ok(Math.max(Math.abs(b.min.x),Math.abs(b.max.x))<=W/2+.001,`${spec.id}: width inside CAD envelope`);
  assert.ok(Math.max(Math.abs(b.min.z),Math.abs(b.max.z))<=L/2+.001,`${spec.id}: length inside CAD envelope`);
  const surfaces=[];root.traverse(n=>{if(n.isMesh&&n.name.startsWith('bearing_'))surfaces.push(n);});
  const bearingBox=new T.Box3();surfaces.forEach(n=>bearingBox.union(new T.Box3().setFromObject(n,true)));
  assert.ok(Math.abs(bearingBox.min.z+L/2)<.001&&Math.abs(bearingBox.max.z-L/2)<.001,'Actual bearing geometry reaches both interface planes');
  const zs=spec.rollerCenters||spec.chainCenters,xs=spec.rollerCenters?[-W*.3,0,W*.3]:spec.chainLanes.flatMap(x=>spec.chainPlateOffsets.map(d=>x+d));
  // Dog-bone chain side plates bear at their two rounded lobes, 32.47 mm
  // either side of the link centre; the waisted middle is intentionally lower.
  const supportZs=spec.chainCenters?zs.flatMap(z=>[-.0324706,.0324717].map(d=>z+d)):zs;
  for(const z of supportZs)for(const x of xs){
    ray.set(new T.Vector3(x,.82,z),new T.Vector3(0,-1,0));ray.far=.04;const hit=ray.intersectObjects(surfaces,false)[0];
    assert.ok(hit,`${spec.id}: missing bearing surface at ${x},${z}`);const error=Math.abs(hit.point.y-.8);assert.ok(error<.001,`${spec.id}: bearing height ${hit.point.y}`);worstSurface=Math.max(worstSurface,error);sampleCount++;
  }
  if(spec.rollerCenters){assert.deepEqual(spec.rollerAxis,[1,0,0]);assert.ok(spec.rollerPitch<=.09501);assert.ok(spec.rollerDiameter>.076&&spec.rollerDiameter<.077);}
  else assert.ok(spec.chainPitch<=.12001);
  assert.deepEqual(spec.transportAxis,[0,0,1]);
  for(const p of placements.filter(p=>p.asset===spec.id))assert.deepEqual(p.size,spec.placementFootprint,'No whole-model scaling at runtime');
  rows.push({id:spec.id,instances:placements.filter(p=>p.asset===spec.id).length,triangles:spec.statistics.triangles,bytes:bytes.length,surfaceSamples:supportZs.length*xs.length});
}
const report={release:'20261112-11',instances:placements.length,variants:rows.length,bearingRaycasts:sampleCount,maximumSurfaceError:worstSurface,totalGLBBytes:rows.reduce((a,r)=>a+r.bytes,0),rows,failures:[]};
await fs.writeFile(new URL('../high-conveyor-validation.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
