import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as T from '../dist/library/vendor/three/build/three.module.js';
import {GLTFLoader} from '../dist/library/vendor/three/examples/jsm/loaders/GLTFLoader.js';
import {createCampusModel} from '../dist/scene-model.js';
const dist=new URL('../dist/',import.meta.url),layout=JSON.parse(await fs.readFile(new URL('data/layout.json',dist))),manifest=JSON.parse(await fs.readFile(new URL('library/manifest.json',dist))),sources=new Map(),specs=new Map(),failures=[],checks=[];
for(const a of manifest.assets){const bytes=await fs.readFile(new URL('library/'+a.model,dist));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),a.modelSha256);sources.set(a.id,await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),''));specs.set(a.id,JSON.parse(await fs.readFile(new URL('library/'+a.spec,dist))));}
const model=createCampusModel(layout,sources,specs);model.root.updateMatrixWorld(true);
assert.equal(layout.buildings.filter(b=>b.kind==='warehouse').length,7);assert.equal(layout.counts.agv,114);assert.ok(layout.placements.filter(p=>p.role==='agv').every(p=>p.asset==='agv-zhilang'));assert.equal(layout.occupancy,1);assert.ok(Object.values(layout.site.surfaceOverlapAreaM2).every(v=>v<1e-6));checks.push('Full rack occupancy; road/hardscape/green/building overlap area zero');checks.push('Seven warehouse shells; all 114 CAD AGV instances use Zhilang');
let worstGround=0;
for(const [id,{object,p}]of model.placementObjects){const bb=new T.Box3().setFromObject(object,true);const gap=bb.min.y-.2;worstGround=Math.max(worstGround,Math.abs(gap));if(Math.abs(gap)>.008)failures.push({id,check:'grounding',gap});assert.ok(bb.min.toArray().concat(bb.max.toArray()).every(Number.isFinite));}
checks.push('Actual evaluated geometry at building floor elevation');
for(const [id,b]of model.buildingGroups){assert.equal(b.walls.children.length,4,'Four continuous facades');for(const w of b.walls.children){const bb=new T.Box3().setFromObject(w,true);assert.ok(bb.max.y-bb.min.y>=b.config.height-.01);}}
checks.push('Four continuous facade groups per building; no raw WALL line extrusion');
assert.equal(layout.placements.filter(p=>p.role==='zhilang-mast').length,13);
assert.ok(layout.placements.filter(p=>p.role==='zhilang-mast').every(p=>p.sourcePaths.length===2&&p.asset==='zhilang-mast-campus'));
assert.ok(!layout.placements.some(p=>p.role==='aux-lift'||p.asset==='auxiliary-envelope'));
assert.equal(layout.placements.filter(p=>p.role==='process-shape').length,11);
for(const p of layout.placements.filter(p=>p.role==='process-shape'))assert.ok(model.placementObjects.has(p.id));
const mastSpec=specs.get('zhilang-mast-campus');assert.ok(mastSpec.carrierHeight<.4);assert.ok(mastSpec.joints.find(j=>j.id==='lift').limits.max>9);
const gate=specs.get('cad-jl1000y');assert.ok(gate.dimensions[2]<.2&&gate.placementFootprint[1]>1,'Door swing arc must not become a solid box');
checks.push('13 physical masts from 26 endpoints; 11 approved process shapes; open gate geometry; un-stretched carrier');
const ray=new T.Raycaster(),samples=[];
for(const role of ['beam-rack','dense-rack','bin-rack']){
 const selected=model.cargoRecords.filter(c=>model.records.get(c.ownerId)?.role===role).filter((c,i)=>i%Math.max(1,Math.floor(model.cargoRecords.filter(c=>model.records.get(c.ownerId)?.role===role).length/15))===0).slice(0,15);
 for(const c of selected){const carrier=model.records.get(c.ownerId).object;carrier.updateMatrixWorld(true);c.object.updateMatrixWorld(true);const bb=new T.Box3().setFromObject(c.object,true),center=bb.getCenter(new T.Vector3());
  // Pallets sit on side rails/crossbars, not on their empty footprint centre.
  // Look for coincident real underside and support faces across the footprint.
  let contacts=0,error=null;
  for(let ix=0;ix<=16;ix++)for(let iz=0;iz<=16;iz++){
   const x=bb.min.x+(bb.max.x-bb.min.x)*(ix+.1)/16.2,z=bb.min.z+(bb.max.z-bb.min.z)*(iz+.1)/16.2;
   ray.set(new T.Vector3(x,bb.min.y+.012,z),new T.Vector3(0,-1,0));ray.far=.03;const support=ray.intersectObject(carrier,true)[0];if(!support||Math.abs(support.point.y-bb.min.y)>.005)continue;
   ray.set(new T.Vector3(x,bb.min.y-.012,z),new T.Vector3(0,1,0));const underside=ray.intersectObject(c.object,true)[0];if(!underside)continue;
   const gap=Math.abs(support.point.y-underside.point.y);if(gap<.005){contacts++;error=error===null?gap:Math.max(error,gap);}
  }
  if(contacts<2)failures.push({id:c.id,check:'actual cargo support',contacts,error,cargoBottom:bb.min.y});samples.push({id:c.id,role,contacts,error});
 }
}
checks.push('45 cargo-to-rack support raycasts across rack families');
const lineBins=model.cargoRecords.filter(c=>c.kind==='conveyor-bin');assert.equal(lineBins.length,10,'Two KXF lines must carry five bins each');
for(const p of layout.placements.filter(p=>['KXF','DYF'].includes(p.sourceBlock))){
 const {object,model:machine,spec}=model.placementObjects.get(p.id);assert.equal(spec.sourceAsset.assetId,'conveyor-zhilang');
 assert.equal(p.building,'5');let redFrame=false;machine.traverse(n=>{if(n.isMesh&&n.material.color?.getHexString()==='9c3330')redFrame=true;});assert.ok(redFrame,'Original Zhilang red frame material is retained');
 const localBox=new T.Box3().setFromObject(sources.get(p.asset).scene,true);assert.ok(localBox.max.x-localBox.min.x<=p.size[0]+.005);assert.ok(localBox.max.z-localBox.min.z<=p.size[1]+.005,'Derived geometry must stay inside CAD navigation footprint');
 for(const c of lineBins.filter(c=>c.ownerId===p.id)){
  const bottom=new T.Box3().setFromObject(c.object,true).min.y;assert.ok(Math.abs(bottom-c.supportY)<.001,'Bin bottom at actual support height');
  const center=new T.Box3().setFromObject(c.object,true).getCenter(new T.Vector3());ray.set(new T.Vector3(center.x,bottom+.01,center.z),new T.Vector3(0,-1,0));ray.far=.025;
  const hit=ray.intersectObject(machine,true)[0];assert.ok(hit&&Math.abs(hit.point.y-bottom)<.002,'KXF bin has a real bearing surface below it');
  assert.ok([...model.batches.values()].some(b=>b.role==='goods'&&b.entries.some(e=>e.id===c.id)),'Conveyor cargo follows goods visibility');
 }
}
checks.push('Four warehouse-5 lines use actual Zhilang GLB frame profiles within CAD footprints; 10 KXF bins have measured support and goods ownership');
for(const warehouse of ['all','2','5','6','3','all']){model.visibility({warehouse,walls:false,goods:false});model.root.updateMatrixWorld(true);const visible=[];for(const [id,b]of model.buildingGroups){if(b.group.visible)visible.push(id);assert.equal(b.goods.visible,false);assert.equal(b.walls.visible,false);assert.equal(b.roof.visible,false);}assert.deepEqual(visible.sort(),(warehouse==='all'?layout.buildings.map(b=>b.id):[warehouse]).sort());}
checks.push('Warehouse switching and goods/walls visibility without residual objects');
const moving=model.dynamic.find(d=>d.p.role==='zhilang-mast'),start=moving.object.position.clone(),cargoCount=model.cargoRecords.length;for(let i=0;i<180;i++)model.tick(1/60);assert.ok(moving.object.position.distanceTo(start)>.01);assert.equal(model.cargoRecords.length,cargoCount);const stopped=moving.object.position.clone();model.tick(0);assert.ok(stopped.distanceTo(moving.object.position)<1e-8);for(const d of model.dynamic)assert.ok(d.object.matrixWorld.elements.every(Number.isFinite));
checks.push('Moving nested equipment changes transforms; zero delta freezes; fixed cargo object pool');
const report={assets:manifest.assets.length,placements:layout.placements.length,cargo: cargoCount,movingDevices:model.dynamic.length,instancedBatches:model.batches.size,geometryGroundErrorMax:worstGround,capacityChecks:layout.capacityChecks,checks,supportSamples:samples,failures,limits:['Not an engineering collision/traffic simulation','Bin bay capacity remains under review where the source contains overlapping 3/4-bin drawings','Process shape is approved, but its exact workflow remains unconfirmed; 26 overlapping bin-bay drawings remain under review']};
await fs.writeFile(new URL('../validation.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,supportSamples:undefined},null,2));model.dispose();if(failures.length)process.exitCode=1;
