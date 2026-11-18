import * as T from './library/vendor/three/build/three.module.js';
import {OrbitControls} from './library/vendor/three/examples/jsm/controls/OrbitControls.js';
import {GLTFLoader} from './library/vendor/three/examples/jsm/loaders/GLTFLoader.js';
import {createRenderQuality} from './render-quality.js?v=20261112-11';
import {createCampusModel} from './scene-model.js?v=20261112-11';

export async function createSceneAdapter({viewport,onProgress}){
 const renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;viewport.append(renderer.domElement);
 const scene=new T.Scene();scene.background=new T.Color('#f4f5f7');const camera=new T.PerspectiveCamera(34,1,.2,4000),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.07;controls.maxPolarAngle=Math.PI*.49;controls.zoomSpeed=.85;controls.autoRotateSpeed=.35;
 const sun=new T.DirectionalLight(0xfff8ed,3.2),ambient=new T.HemisphereLight(0xeaf0f6,0x9b9b8d,2.5);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.00004;sun.shadow.normalBias=.012;sun.shadow.radius=2;scene.add(sun,sun.target,ambient);
 const quality=createRenderQuality(renderer,scene,camera);
 const [layout,manifest]=await Promise.all([fetch('./data/layout.json?v=20261112-11').then(r=>r.json()),fetch('./library/manifest.json?v=20261112-11').then(r=>r.json())]);onProgress(12);const sources=new Map(),specs=new Map(),loader=new GLTFLoader();let loaded=0;
 // A bounded loader prevents a first-frame shader/parse burst from 17 GLBs.
 const retry=async(fn)=>{let last;for(let i=0;i<3;i++)try{return await fn();}catch(e){last=e;if(i<2)await new Promise(resolve=>setTimeout(resolve,250*(i+1)));}throw last;};
 const queue=[...manifest.assets];await Promise.all(Array.from({length:2},async()=>{while(queue.length){const a=queue.shift();const [gltf,spec]=await Promise.all([retry(()=>loader.loadAsync('./library/'+a.model+'?v=20261112-11&h='+a.modelSha256)),retry(()=>fetch('./library/'+a.spec+'?v=20261112-11&h='+a.modelSha256).then(r=>{if(!r.ok)throw Error(a.spec+': '+r.status);return r.json();}))]);
  if(a.id==='lift')gltf.scene.traverse(n=>{if(n.isMesh)for(const m of [].concat(n.material)){m.transparent=false;m.opacity=1;if('transmission'in m)m.transmission=0;}});
  quality.materials(gltf.scene,a.id);sources.set(a.id,gltf);specs.set(a.id,spec);onProgress(12+(++loaded/manifest.assets.length)*63);
 }}));
 const model=createCampusModel(layout,sources,specs);scene.add(model.root);quality.materials(model.root);onProgress(90);
 const labelLayer=document.createElement('div');labelLayer.className='building-label-layer';labelLayer.setAttribute('aria-label','建筑名称');viewport.append(labelLayer);
 const labels=layout.buildings.filter(b=>b.kind==='warehouse'||b.kind==='office').map(b=>{const node=document.createElement(b.kind==='warehouse'?'button':'div');node.className='building-label';node.textContent=b.label;if(b.kind==='warehouse')node.setAttribute('aria-label','进入'+b.label);labelLayer.append(node);return {node,building:b,point:new T.Vector3((b.bounds[0][0]+b.bounds[1][0])/2,b.height+.8,-(b.bounds[0][1]+b.bounds[1][1])/2),projected:new T.Vector3()};});
 const grid=new T.GridHelper(740,74,0xa0a9ad,0xd5dadb);grid.position.set(45,.025,20);grid.visible=false;scene.add(grid);
 const events=new Set(),abort=new AbortController();let state={warehouse:'all',floor:'all',walls:true,goods:true,grid:false,playing:true,speed:1,view:'perspective',orbit:false},disposed=false,last=0,dirty=true,tween=null,followDevice=null;
 const followLast=new T.Vector3(),followDelta=new T.Vector3(),routeGeometry=new T.BufferGeometry(),routePositions=new Float32Array(3000);routeGeometry.setAttribute('position',new T.BufferAttribute(routePositions,3).setUsage(T.DynamicDrawUsage));
 const routeLine=new T.Line(routeGeometry,new T.LineBasicMaterial({color:0x518394,transparent:true,opacity:.7}));routeLine.frustumCulled=false;routeLine.visible=false;scene.add(routeLine);
 const warehouseConfigs=layout.buildings.filter(b=>b.kind==='warehouse');
 const focusable=layout.placements.filter(p=>['lift','agv','zhilang-mast','process-shape','station','conveyor'].includes(p.role));
 const labelCounts=new Map(),devices=focusable.map(p=>{const label=p.role==='conveyor'?(p.asset.startsWith('continuous-chain')?'链式线':'辊筒线'):(p.deviceLabel||'设备'),key=p.building+'-'+label,n=(labelCounts.get(key)||0)+1;labelCounts.set(key,n);return {id:p.id,label:label+' '+String(n).padStart(2,'0'),warehouseId:p.building,floorIds:['1'],focusFloor:'1'};});
 const emit=patch=>{Object.assign(state,patch);events.forEach(fn=>fn(patch));dirty=true;};
 function enterWarehouse(id){followDevice=null;emit({warehouse:id,floor:'all',device:null,walls:false,orbit:false,followCargo:false});model.visibility(state);fit(model.bounds(id));}
 function focusDevice(id){const d=devices.find(d=>d.id===id);if(!d)return;emit({warehouse:d.warehouseId,floor:'1',device:id,walls:false,orbit:false,followCargo:false});model.visibility(state);controls.autoRotate=false;fit(new T.Box3().setFromObject(model.records.get(id).object,true),'perspective',true,model.records.get(id).role==='conveyor');followDevice=model.fleet.byId.has(id)?id:null;if(followDevice)followLast.copy(model.records.get(id).object.position);}
 for(const l of labels)if(l.building.kind==='warehouse')l.node.addEventListener('click',e=>{e.stopPropagation();enterWarehouse(l.building.id);},{signal:abort.signal});
 function resize(){const {width,height}=viewport.getBoundingClientRect();if(!width||!height||quality.exporting)return;renderer.setSize(width,height,false);quality.resize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();dirty=true;}
 const observer=new ResizeObserver(resize);observer.observe(viewport);resize();
 function fit(box,view=state.view,smooth=true,avoidRacks=false){
  const center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3()),radius=Math.max(size.length()/2,1),half=T.MathUtils.degToRad(camera.fov/2),usable=innerWidth>1000?.64:innerWidth>650?.59:.82,distance=radius/Math.sin(half)/Math.min(camera.aspect*usable,1)*1.07;
  const dirs={perspective:new T.Vector3(1,.9,1.3),top:new T.Vector3(0,1,.0001),front:new T.Vector3(0,.08,1),side:new T.Vector3(1,.08,0)},target=center.clone().add(dirs[view].clone().normalize().multiplyScalar(distance));
  if(avoidRacks){
   // Small equipment lies beside tall racks. Select a clear sightline rather
   // than putting the close-up camera inside the neighbouring storage bay.
   const obstacles=[...model.placementObjects.values()].filter(({p})=>p.building===state.warehouse&&/rack|lift|mast/.test(p.role)).map(({object})=>new T.Box3().setFromObject(object).expandByScalar(.15));
   const sight=new T.Ray(),hit=new T.Vector3();let found=false;
   for(const elevation of [.55,1,2,8]){
    for(let i=0;i<8;i++){
     const angle=Math.atan2(1,1.3)+i*Math.PI/4,dir=new T.Vector3(Math.sin(angle),elevation,Math.cos(angle)).normalize();sight.set(center,dir);
     if(obstacles.some(b=>sight.intersectBox(b,hit)&&hit.distanceTo(center)<distance))continue;
     target.copy(center).addScaledVector(dir,distance);found=true;break;
    }
    if(found)break;
   }
  }
  controls.autoRotate=false;controls.enableDamping=false;controls.update();camera.near=Math.max(.04,radius/1600);camera.far=Math.max(2500,distance*5);camera.updateProjectionMatrix();controls.minDistance=Math.max(.5,radius*.04);controls.maxDistance=Math.max(1500,distance*3);
  if(smooth)tween={start:performance.now(),from:camera.position.clone(),to:target,targetFrom:controls.target.clone(),targetTo:center};else{camera.position.copy(target);controls.target.copy(center);controls.update();}
  controls.enableDamping=true;controls.autoRotate=state.orbit;dirty=true;shadowFrame(box);
 }
 function shadowFrame(box){const center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3()),radius=Math.max(8,Math.max(size.x,size.z)*.8+size.y*.4),cam=sun.shadow.camera;cam.left=cam.bottom=-radius;cam.right=cam.top=radius;cam.near=1;cam.far=1600;cam.updateProjectionMatrix();sun.target.position.copy(center);light(state.lighting);}
 function light(value){if(!value)return;const az=T.MathUtils.degToRad(value.azimuth),el=T.MathUtils.degToRad(value.elevation);scene.background.set(value.background);sun.color.set(value.color);sun.intensity=value.strength;ambient.intensity=value.ambient;sun.position.copy(sun.target.position).add(new T.Vector3(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)).multiplyScalar(650));dirty=true;}
 function shadows(enabled){
  const on=enabled!==false;renderer.shadowMap.enabled=on;sun.castShadow=on;sun.shadow.needsUpdate=true;
  // Switching off map updates alone leaves the old map in already compiled
  // receiving materials. Remove the light's shadow and invalidate variants.
  const mats=new Set();scene.traverse(n=>{if(n.isMesh)[].concat(n.material).forEach(m=>mats.add(m));});mats.forEach(m=>m.needsUpdate=true);dirty=true;
 }
 controls.addEventListener('start',()=>{tween=null;followDevice=null;controls.autoRotate=false;if(state.orbit||state.followCargo)emit({orbit:false,followCargo:false});});controls.addEventListener('change',()=>{dirty=true;});
 const ray=new T.Raycaster(),pointer=new T.Vector2();let down;
 renderer.domElement.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];},{signal:abort.signal});
 renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);
  const visible=[];model.root.traverseVisible(n=>{if(n.isMesh)visible.push(n);});const hit=ray.intersectObjects(visible,false)[0];if(!hit)return;
  const rawId=hit.object.userData.ids?.[hit.instanceId],id=model.cargoRecords.find(c=>c.id===rawId)?.ownerId||rawId,d=devices.find(d=>d.id===id);let owner=hit.object.userData.owner,node=hit.object;
  while(!owner&&node){owner=node.userData.buildingId;node=node.parent;}
  if(d&&model.fleet.byId.has(id)){focusDevice(id);return;}
  if(state.warehouse==='all'&&warehouseConfigs.some(b=>b.id===owner)){enterWarehouse(owner);return;}
  if(d)focusDevice(id);
 },{signal:abort.signal});
 const frameSamples=[];let frames=0,lastExport=null;
 function updateLabels(){
  const show=state.warehouse==='all'&&state.names!==false;labelLayer.hidden=!show;if(!show)return;
  const w=viewport.clientWidth,h=viewport.clientHeight,placed=[];
  for(const l of labels){const p=l.projected.copy(l.point).project(camera),x=(p.x+1)*w/2,anchorY=(1-p.y)*h/2;l.node.hidden=p.z<-1||p.z>1||x<0||x>w||anchorY<0||anchorY>h;if(l.node.hidden)continue;
   const width=l.width||(l.width=l.node.offsetWidth),height=32;let y=anchorY;
   for(let attempt=0;attempt<8;attempt++){const hit=placed.find(r=>Math.abs(r.x-x)<(r.width+width)/2+5&&y-height<r.y+5&&y>r.y-height-5);if(!hit)break;y=hit.y-height-6;}
   y=Math.max(height+4,y);placed.push({x,y,width});l.node.style.transform=`translate(${x}px,${y}px) translate(-50%,-100%)`;l.node.style.setProperty('--stem',`${Math.max(6,anchorY-y+6)}px`);
  }
 }
 renderer.setAnimationLoop(now=>{if(disposed)return;if(quality.exporting){last=now;return;}const dt=last?Math.min((now-last)/1000,.05):0;last=now;if(document.hidden)return;
  if(state.playing){model.tick(dt*state.speed);dirty=true;}
  if(followDevice){const obj=model.records.get(followDevice).object;if(!tween){followDelta.subVectors(obj.position,followLast);camera.position.add(followDelta);controls.target.add(followDelta);sun.position.add(followDelta);sun.target.position.add(followDelta);}followLast.copy(obj.position);}
  const agent=model.fleet.byId.get(state.device);routeLine.visible=!!agent&&state.warehouse==='5';
  if(routeLine.visible){const pose=model.fleet.pose(agent),points=[[pose.x,pose.z],...agent.path.map(n=>layout.navigation.points[n])];for(let i=0;i<Math.min(points.length,1000);i++)routePositions.set([points[i][0],.212,points[i][1]],i*3);routeGeometry.setDrawRange(0,Math.min(points.length,1000));routeGeometry.attributes.position.needsUpdate=true;}
  if(tween){const t=Math.min(1,(now-tween.start)/550),k=1-(1-t)**3;camera.position.lerpVectors(tween.from,tween.to,k);controls.target.lerpVectors(tween.targetFrom,tween.targetTo,k);if(t===1)tween=null;dirty=true;}
  controls.update(dt);if(dirty||controls.autoRotate){
   // Keep useful depth precision when zooming from individual vehicles to a
   // 700 m campus; the old fixed sub-metre near plane wasted most of it.
   const near=Math.max(.04,camera.position.distanceTo(controls.target)/200);
   if(Math.abs(camera.near-near)>.001){camera.near=near;camera.updateProjectionMatrix();}
   const start=performance.now();quality.render({contact:state.contactShadows!==false,distance:camera.position.distanceTo(controls.target)});updateLabels();frameSamples.push(performance.now()-start);if(frameSamples.length>180)frameSamples.shift();frames++;dirty=false;}
 });
 // Read-only diagnostics are DOM-backed for browser QA; no scene labels.
 const diagnostics=document.createElement('output');diagnostics.hidden=true;diagnostics.id='scene-diagnostics';viewport.append(diagnostics);
 const diagnosticTimer=setInterval(()=>{diagnostics.textContent=JSON.stringify({release:'20261112-11',ready:true,highConveyors:layout.placements.filter(p=>p.role==='conveyor'&&specs.get(p.asset)?.quality==='high-derived').length,aoActive:quality.aoActive,exporting:quality.exporting,lastExport,warehouse:state.warehouse,floor:state.floor,playing:state.playing,speed:state.speed,walls:state.walls,goods:state.goods,simTime:+model.simTime.toFixed(3),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,frameCPUms:frameSamples.length?+(frameSamples.reduce((s,v)=>s+v,0)/frameSamples.length).toFixed(2):0,visibleBuildings:[...model.buildingGroups].filter(([id,b])=>b.group.visible).map(([id])=>id),shadows:renderer.shadowMap.enabled,followDevice,followTarget:followDevice?model.records.get(followDevice).object.position.toArray():null,cameraPosition:camera.position.toArray(),controlTarget:controls.target.toArray(),names:state.names,labelsVisible:labels.filter(l=>!labelLayer.hidden&&!l.node.hidden).length,fleetMoving:model.fleet.agents.filter(a=>a.mode==='moving').length,fleetTurning:model.fleet.agents.filter(a=>a.mode==='turning').length,fleetDistance:+model.fleet.agents.reduce((s,a)=>s+a.distance,0).toFixed(2),movingDevices:model.dynamic.length,frames,pixelRatio:renderer.getPixelRatio()});},500);
 const dispatch=async(action,snapshot)=>{state=structuredClone(snapshot);switch(action.type){
  case'initialize':model.visibility(state);grid.visible=state.grid;light(state.lighting);fit(model.bounds(state.warehouse),state.view,false);onProgress(100);break;
  case'select-warehouse':case'select-floor':followDevice=null;model.visibility(state);fit(model.bounds(state.warehouse));break;
  case'focus-device':focusDevice(action.id);break;
  case'view':case'fit':followDevice=null;fit(model.bounds(state.warehouse));break;
  case'zoom':camera.position.sub(controls.target).multiplyScalar(action.factor).add(controls.target);controls.update();break;
  case'visibility':model.visibility(state);grid.visible=state.grid;if(action.key==='shadows')shadows(state.shadows);break;
  case'orbit':controls.autoRotate=state.orbit;break;
  case'lighting':light(state.lighting);break;
  case'playback':break;
  case'export-4k':{
   const button=document.getElementById('export-4k'),panels=[...document.querySelectorAll('aside,.playback,.viewport-tools')];
   button.disabled=true;button.textContent='正在导出…';
   try{lastExport=await quality.exportPNG({light:sun,contact:state.contactShadows!==false,distance:camera.position.distanceTo(controls.target),before:()=>{controls.enabled=false;panels.forEach(p=>p.inert=true);},after:()=>{controls.enabled=true;panels.forEach(p=>p.inert=false);last=performance.now();dirty=true;}});}
   finally{button.disabled=false;button.textContent='4K 导出';resize();}
   break;
  }
 }dirty=true;};
 return {catalog:{overviewLabel:'园区总览',warehouses:warehouseConfigs.map(b=>({id:b.id,label:b.label,floors:[{id:'1',label:'1F'}]})),devices},capabilities:{logistics:false,production:false,followCargo:false},storageKey:'campus-20261026-lighting-v2',initialState:{warehouse:'all',floor:'all'},dispatch,subscribe(fn){events.add(fn);return()=>events.delete(fn);},dispose(){disposed=true;clearInterval(diagnosticTimer);abort.abort();observer.disconnect();renderer.setAnimationLoop(null);controls.dispose();model.dispose();routeGeometry.dispose();routeLine.material.dispose();const geometries=new Set(),mats=new Set();sources.forEach(g=>g.scene.traverse(n=>{if(n.isMesh){geometries.add(n.geometry);[].concat(n.material).forEach(m=>mats.add(m));}}));geometries.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());quality.dispose();grid.geometry.dispose();[].concat(grid.material).forEach(m=>m.dispose());sun.shadow.map?.dispose();renderer.dispose();renderer.domElement.remove();diagnostics.remove();labelLayer.remove();events.clear();}};
}
