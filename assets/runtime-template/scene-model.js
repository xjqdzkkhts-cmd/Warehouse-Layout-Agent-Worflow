import * as T from './library/vendor/three/build/three.module.js';
import {mergeGeometries} from './library/vendor/three/examples/jsm/utils/BufferGeometryUtils.js';
import {createFleet} from './navigation.js?v=20261112-11';

export function createCampusModel(layout,sources,specs){
 const fleet=layout.navigation?createFleet(layout.navigation,layout.placements):null;
 const root=new T.Group(),site=new T.Group(),buildingGroups=new Map(),records=new Map(),dynamic=[],batches=new Map(),owned=new Set(),materials=new Map();root.add(site);site.name='campus-surfaces';
 const mat=(name,color,roughness=.75,metalness=0)=>{if(!materials.has(name))materials.set(name,new T.MeshStandardMaterial({name,color,roughness,metalness}));return materials.get(name);};
 const concrete=mat('concrete',0xc8cdce),wallMat=mat('warehouse-wall',0xe4e7e5),roofMat=mat('warehouse-roof',0xc4ced1,.55,.22),trimMat=mat('steel-trim',0x6e7a80,.5,.35),asphalt=mat('asphalt',0x667077),publicAsphalt=mat('public-road',0x464e54),green=mat('lawn',0x7c9b6b),curbMat=mat('curb',0xdadfd7),lineMat=mat('marking',0xe2e0cc),doorMat=mat('dock-door',0x707d85);
 lineMat.polygonOffset=true;lineMat.polygonOffsetFactor=-1;lineMat.polygonOffsetUnits=-4;lineMat.depthWrite=false;
 function mesh(geometry,material,parent){owned.add(geometry);const n=new T.Mesh(geometry,material);n.receiveShadow=true;parent.add(n);return n;}
 function cube(parent,d,p,material,shadow=false){const n=mesh(new T.BoxGeometry(...d),material,parent);n.position.fromArray(p);n.castShadow=shadow;return n;}
 function fill(shapes,y,material,parent=site){for(const value of shapes){const s=new T.Shape(value.outer.map(p=>new T.Vector2(...p)));for(const hole of value.holes||[])s.holes.push(new T.Path(hole.map(p=>new T.Vector2(...p))));const g=new T.ShapeGeometry(s);g.rotateX(-Math.PI/2);g.translate(0,y,0);mesh(g,material,parent);}}
 function line(points,y,width,material,parent=site){for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length<.02)continue;const n=cube(parent,[width,.055,length],[(a[0]+b[0])/2,y,-(a[1]+b[1])/2],material);n.rotation.y=Math.atan2(dx,-dy);}}
 // These are disjoint polygons. A full campus floor underneath them would
 // fight the asphalt at distant camera positions, even with a 1 cm offset.
 fill(layout.site.publicRoads,0,publicAsphalt);fill(layout.site.hardscape,0,concrete);fill(layout.site.roads,0,asphalt);fill(layout.site.greens,.038,green);
 // Curbs follow actual CAD road outlines. They do not generate fragmented walls.
 for(const path of layout.site.curbs)line(path.points,.065,.12,curbMat);
 for(const path of layout.site.parking)line(path,.082,.11,lineMat);
 const dashed=(a,b,width,material)=>{const dist=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=(b[0]-a[0])/dist,dy=(b[1]-a[1])/dist;for(let d=0;d<dist;d+=8)line([[a[0]+dx*d,a[1]+dy*d],[a[0]+dx*Math.min(d+3.5,dist),a[1]+dy*Math.min(d+3.5,dist)]],.025,width,material);};
 for(const pts of layout.site.roadCenterlines)for(let i=1;i<pts.length;i++)dashed(pts[i-1],pts[i],.10,lineMat);
 // Trees use repeated low-complexity geometry; greens stay readable at park scale.
 const trunkG=new T.CylinderGeometry(.11,.16,1,7),leafG=new T.IcosahedronGeometry(1,1);owned.add(trunkG);owned.add(leafG);
 const trunks=new T.InstancedMesh(trunkG,mat('bark',0x756a57),layout.site.trees.length),leaves=new T.InstancedMesh(leafG,mat('foliage',0x557451),layout.site.trees.length),temp=new T.Object3D();site.add(trunks,leaves);leaves.castShadow=true;
 layout.site.trees.forEach(([x,y,h],i)=>{temp.position.set(x,.038+h*.35,-y);temp.scale.set(1,h*.7,1);temp.updateMatrix();trunks.setMatrixAt(i,temp.matrix);temp.position.y=.038+h*.74;temp.scale.set(h*.34,h*.45,h*.34);temp.rotation.y=i*1.618;temp.updateMatrix();leaves.setMatrixAt(i,temp.matrix);leaves.setColorAt(i,new T.Color().setHSL(.27+(i%5)*.008,.16+(i%3)*.035,.32+(i%4)*.035));});
 trunks.computeBoundingSphere();leaves.computeBoundingSphere();
 for(const b of layout.buildings){
  const group=new T.Group(),walls=new T.Group(),roof=new T.Group(),equipment=new T.Group(),goods=new T.Group();group.name='building-'+b.id;group.userData.buildingId=b.id;walls.name='walls-'+b.id;roof.name='roof-'+b.id;group.add(walls,roof,equipment,goods);root.add(group);buildingGroups.set(b.id,{group,walls,roof,equipment,goods,config:b});
  const [[x0,y0],[x1,y1]]=b.bounds,W=x1-x0,D=y1-y0,cx=(x0+x1)/2,cz=-(y0+y1)/2,H=b.height;
  cube(group,[W,.2,D],[cx,.1,cz],concrete);
  const perimeter=[[x0,y0,x1,y0],[x1,y0,x1,y1],[x1,y1,x0,y1],[x0,y1,x0,y0]];
  for(let side=0;side<4;side++){
   const [ax,ay,bx,by]=perimeter[side],L=Math.hypot(bx-ax,by-ay),wall=new T.Group();wall.name='continuous-wall-'+side;wall.position.set((ax+bx)/2,0,-(ay+by)/2);wall.rotation.y=Math.atan2(-(by-ay),bx-ax);walls.add(wall);
   cube(wall,[L+.24,H,.24],[0,.2+H/2,0],wallMat,true);
   cube(wall,[L+.26,.28,.28],[0,.34,0],trimMat);
   cube(wall,[L+.3,.18,.32],[0,H+.16,0],trimMat);
   // Single broad facade panels stand in for dock openings/windows. The wall
   // itself is deliberately one continuous surface per side.
   if(b.kind==='warehouse'&&(side===0||side===2||(b.extraDockSides||[]).includes(side))){
    const count=Math.max(1,Math.floor((L-12)/18));for(let i=0;i<count;i++){const x=(i+.5)*L/count-L/2;cube(wall,[4.2,4.4,.035],[x,2.4,side<2?.145:-.145],doorMat);}
   }
   if(b.kind==='office')for(let floor=0;floor<3;floor++)cube(wall,[L-.9,1.4,.04],[0,2.9+floor*5,.15],mat('office-glass',0x647b88,.3,.45));
  }
  cube(roof,[W+.65,.35,D+.65],[cx,H+.38,cz],roofMat,true);
  if(b.kind==='warehouse')for(let z=-D/2+6;z<D/2;z+=12)cube(roof,[W*.74,.045,.6],[cx,H+.58,cz+z],mat('roof-light',0xa5b6bd,.35,.35));
 }
 // Loading bridge between the two cold-chain buildings, present on the site plan.
 cube(site,[17,.2,8],[58.64,.1,29.143],concrete);
 function collect(wrapper,owner,role,id,moving=false){
  wrapper.updateMatrixWorld(true);
  wrapper.traverse(n=>{if(!n.isMesh)return;const key=[owner,role,n.geometry.uuid,...[].concat(n.material).map(m=>m.uuid)].join('|');if(!batches.has(key))batches.set(key,{owner,role,geometry:n.geometry,material:n.material,entries:[],moving:false});const batch=batches.get(key);batch.entries.push({mesh:n,id});batch.moving||=moving;});
 }
 const placementObjects=new Map(),cargoRecords=[];
 const applyTransform=(object,p,spec)=>{object.position.fromArray(p.position);object.rotation.y=T.MathUtils.degToRad(p.yaw);const footprint=spec.placementFootprint||[spec.dimensions[0],spec.dimensions[2]];if(p.scale)object.scale.setScalar(p.scale);else if(p.role==='floor-load')object.scale.set(.86,1,.86);else object.scale.set(p.size[0]/footprint[0],(p.height||spec.dimensions[1])/spec.dimensions[1],p.size[1]/footprint[1]);object.updateMatrixWorld(true);};
 for(const p of layout.placements){
  const source=sources.get(p.asset),spec=specs.get(p.asset);if(!source||!spec)throw Error('Missing GLB: '+p.asset);
  const object=new T.Group(),model=source.scene.clone(true);object.add(model);object.name=p.id;applyTransform(object,p,spec);placementObjects.set(p.id,{object,model,p,spec});records.set(p.id,{...p,object});
  let mixer=null;
  if(source.animations.length&&['agv','lift','zhilang-mast'].includes(p.role)){
   mixer=new T.AnimationMixer(model);let clip=source.animations.find(c=>c.name==='升降循环')||source.animations[0];clip=clip.clone();clip.tracks=clip.tracks.filter(t=>!t.name.includes('joint__travel.'));mixer.clipAction(clip).play();mixer.setTime((hash(p.id)%800)/100);object.updateMatrixWorld(true);
  }
  const moving=!!mixer||!!p.motion;collect(object,p.building,p.role==='floor-load'?'goods':'equipment',p.id,moving);
  if(moving)dynamic.push({object,model,p,mixer,rest:object.position.clone(),axis:p.motion?.axis?new T.Vector3(...p.motion.axis):null,phase:(hash(p.id)%1000)/1000,wheels:(spec.joints||[]).filter(j=>j.id.startsWith('wheel_')).map(j=>({node:model.getObjectByName(j.node),side:Math.sign(j.pivot[0])}))});
  for(const item of spec.displayCargo||[]){
   const cargo=new T.Group();cargo.add(sources.get(item.asset).scene.clone(true));cargo.position.fromArray(item.position);cargo.rotation.y=item.yaw||0;cargo.scale.setScalar(item.scale||1);object.add(cargo);object.updateMatrixWorld(true);
   const id=p.id+'-'+item.id;collect(cargo,p.building,'goods',id);cargoRecords.push({id,ownerId:p.id,supportY:p.position[1]+item.position[1]*object.scale.y,object:cargo,building:p.building,kind:'conveyor-bin'});
  }
  const surfaces=spec.storageSurfaces;
  if(surfaces){
   const isBin=p.role==='bin-rack',cols=isBin?p.columns:p.role==='beam-rack'?2:1,rows=isBin&&p.asset==='bin-rack-double'?2:1;
   for(let level=0;level<surfaces.length;level++)for(let c=0;c<cols;c++)for(let r=0;r<rows;r++){
    const id=p.id+'-cargo-'+[level,c,r].join('-');if(hash(id)%1000>=layout.occupancy*1000)continue;
    const asset=isBin?'bin-display':'blue-pallet-load',sourceCargo=sources.get(asset),cargo=new T.Group();cargo.add(sourceCargo.scene.clone(true));
    const width=p.size[0],depth=p.size[1],sx=object.scale.x,sz=object.scale.z;
    const local=new T.Vector3((c+.5)*width/cols-width/2,surfaces[level]*object.scale.y,(r+.5)*depth/rows-depth/2);local.x/=sx;local.y/=object.scale.y;local.z/=sz;object.localToWorld(local);cargo.position.copy(local);cargo.rotation.y=object.rotation.y;
    if(isBin)cargo.scale.set(1.1,1.35,1.1);else if(p.role==='dense-rack')cargo.scale.set(.77,1,.85);else cargo.scale.set(.84,1,.88);
    collect(cargo,p.building,'goods',id);cargoRecords.push({id,ownerId:p.id,supportY:local.y,object:cargo,building:p.building});
   }
  }
  if(p.role==='agv'&&hash(p.id)%5===0){
   const lift=model.getObjectByName('joint__lift');if(lift){
    const cargo=new T.Group();cargo.add(sources.get('bin').scene.clone(true));const support=new T.Box3().setFromObject(lift,true);cargo.position.set((support.min.x+support.max.x)/2,support.max.y,(support.min.z+support.max.z)/2);cargo.scale.setScalar(1.1);object.updateMatrixWorld(true);lift.attach(cargo);collect(cargo,p.building,'goods',p.id+'-load',true);cargoRecords.push({id:p.id+'-load',ownerId:p.id,object:cargo,building:p.building,moving:true});
   }
  }
 }
 // Rack rails follow the original CAD centre strips. Keep them with their owner.
 for(const p of layout.placements.filter(p=>p.role==='zhilang-mast')){const g=buildingGroups.get(p.building).equipment;for(const side of [-1,1])cube(g,[p.travelLength+p.size[0],.002,.025],[p.position[0]+p.travelLength/2,.201,p.position[2]+side*(p.size[1]/2-.025)],trimMat);}
 for(const rail of layout.rails){const g=buildingGroups.get(rail.building).equipment;for(const y of rail.levels){const [w,d]=rail.size;if(w>d){for(const s of [-1,1])cube(g,[w,.045,.04],[rail.center[0],.2+y,-rail.center[1]+s*Math.min(d*.34,.42)],trimMat);}else for(const s of [-1,1])cube(g,[.04,.045,d],[rail.center[0]+s*Math.min(w*.34,.42),.2+y,-rail.center[1]],trimMat);}}
 const batchMeshes=[];
 for(const b of batches.values()){
  const mesh=new T.InstancedMesh(b.geometry,b.material,b.entries.length);mesh.name='batch-'+b.owner+'-'+b.role;mesh.userData={owner:b.owner,role:b.role,ids:b.entries.map(e=>e.id)};mesh.receiveShadow=true;mesh.castShadow=true;if(b.moving)mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  for(let i=0;i<b.entries.length;i++)mesh.setMatrixAt(i,b.entries[i].mesh.matrixWorld);mesh.computeBoundingBox();mesh.computeBoundingSphere();if(b.moving)mesh.frustumCulled=false;
  buildingGroups.get(b.owner)[b.role==='goods'?'goods':'equipment'].add(mesh);b.render=mesh;batchMeshes.push(mesh);
 }
 // Merge repeated site/facade boxes per material while preserving each wall,
 // roof and building's independent visibility group.
 const parents=[];root.traverse(n=>{if(n.isGroup)parents.push(n);});
 for(const parent of parents){const groups=new Map();for(const n of parent.children)if(n.isMesh&&!n.isInstancedMesh&&owned.has(n.geometry)){const key=n.material.uuid;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(n);}
  for(const list of groups.values())if(list.length>1){const geoms=list.map(n=>{n.updateMatrix();const g=n.geometry.clone().applyMatrix4(n.matrix);return g.index?g.toNonIndexed():g;}),g=mergeGeometries(geoms,false),n=mesh(g,list[0].material,parent);n.castShadow=list.some(n=>n.castShadow);for(const old of list){parent.remove(old);owned.delete(old.geometry);old.geometry.dispose();}geoms.forEach(g=>g.dispose());}
 }
 site.traverse(n=>{if(n.isMesh&&n.material===lineMat){n.renderOrder=2;n.castShadow=false;}});
 let simTime=0;
 function tick(dt){simTime+=dt;fleet?.update(dt);for(const a of dynamic){a.mixer?.update(dt);
  if(a.p.motion?.kind==='navigation'){
   const pose=fleet.pose(fleet.byId.get(a.p.id));a.object.position.set(pose.x,.2,pose.z);a.object.rotation.y=pose.yaw;
   for(const w of a.wheels)if(w.node)w.node.rotation.x=(pose.distance+w.side*pose.yaw*.25)/.09;
  }else if(a.p.motion){const m=a.p.motion,t=(simTime/m.duration+a.phase)%1,k=(1-Math.cos(t*2*Math.PI))*.5;a.object.position.copy(a.rest).addScaledVector(a.axis,k*m.distance);}
  a.object.updateMatrixWorld(true);}for(const b of batches.values())if(b.moving){for(let i=0;i<b.entries.length;i++)b.render.setMatrixAt(i,b.entries[i].mesh.matrixWorld);b.render.instanceMatrix.needsUpdate=true;}}
 function visibility(state){site.visible=state.warehouse==='all';for(const [id,b]of buildingGroups){b.group.visible=state.warehouse==='all'||state.warehouse===id;b.walls.visible=state.walls;b.roof.visible=state.walls&&(state.warehouse==='all'||b.config.kind!=='warehouse');b.equipment.visible=!b.roof.visible;b.goods.visible=state.goods&&!b.roof.visible;} }
 function bounds(id='all'){if(id==='all'){const ps=layout.site.boundary.flatMap(s=>s.outer);return new T.Box3(new T.Vector3(Math.min(...ps.map(p=>p[0]))-50,0,-Math.max(...ps.map(p=>p[1]))-20),new T.Vector3(Math.max(...ps.map(p=>p[0]))+100,16,-Math.min(...ps.map(p=>p[1]))+55));}const b=buildingGroups.get(id).config;return new T.Box3(new T.Vector3(b.bounds[0][0],0,-b.bounds[1][1]),new T.Vector3(b.bounds[1][0],b.height,-b.bounds[0][1]));}
 function dispose(){for(const a of dynamic){a.mixer?.stopAllAction();a.mixer?.uncacheRoot(a.model);}for(const b of batchMeshes)b.dispose();owned.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());root.clear();}
 tick(0);return {root,site,buildingGroups,records,dynamic,batches,batchMeshes,placementObjects,cargoRecords,fleet,bounds,visibility,tick,dispose,get simTime(){return simTime;}};
}
export function hash(s){let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return h>>>0;}
