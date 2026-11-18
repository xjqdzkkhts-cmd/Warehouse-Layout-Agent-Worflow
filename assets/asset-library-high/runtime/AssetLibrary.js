import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// Imports geometry exclusively from manifest-referenced GLBs, never a warehouse
// scene dump. A cached source remains immutable; each placement owns its joints.
export class AssetLibrary {
 constructor(baseURL,{loader=new GLTFLoader(),fetchFn=fetch}={}){
  this.baseURL=new URL(baseURL,globalThis.location?.href||'http://localhost/');
  this.loader=loader;this.fetchFn=url=>fetchFn(url);this.catalog=null;this.cache=new Map();this.instances=new Set();
 }
 async json(path){const response=await this.fetchFn(new URL(path,this.baseURL));if(!response.ok)throw Error(`Asset metadata ${response.status}: ${path}`);return response.json();}
 async initialize(){this.catalog=await this.json('manifest.json');return this;}
 async source(id){
  if(!this.catalog)await this.initialize();const entry=this.catalog.assets.find(a=>a.id===id);if(!entry)throw Error(`Unknown asset: ${id}`);
  if(!this.cache.has(id)){const promise=Promise.all([this.json(entry.spec),this.loader.loadAsync(new URL(entry.model,this.baseURL).href)]).then(([spec,gltf])=>({spec,gltf}));this.cache.set(id,promise);promise.catch(()=>{if(this.cache.get(id)===promise)this.cache.delete(id);});}
  return this.cache.get(id);
 }
 async instantiate(id,{position=[0,0,0],yaw=0,scale=1}={}){
  if(!(scale>0&&Number.isFinite(scale)))throw Error('Asset scale must be positive and uniform');
  const {spec,gltf}=await this.source(id);const object=gltf.scene.clone(true);
  object.position.fromArray(position);object.rotation.y=yaw;object.scale.setScalar(scale);
  const instance=new AssetInstance(this,object,spec);this.instances.add(instance);return instance;
 }
 dispose(){if(this.instances.size)throw Error('Release all asset instances before disposing their shared models');for(const value of this.cache.values())value.then(({gltf})=>{const geometries=new Set(),materials=new Set();gltf.scene.traverse(n=>{if(n.isMesh){geometries.add(n.geometry);for(const m of [].concat(n.material))materials.add(m);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());});this.cache.clear();}
}
export class AssetInstance {
 constructor(library,object,spec){
  this.library=library;this.object=object;this.spec=spec;this.root=object.getObjectByName('asset__'+spec.id);this.ports=new Map();this.joints=new Map();this.configuredParameters=new Set();this.carried=new Set();this.released=false;
  if(!this.root)throw Error('Missing asset root: '+spec.id);
  for(const p of spec.ports){const node=object.getObjectByName(p.node);if(!node)throw Error('Missing port: '+p.node);this.ports.set(p.id,{node,spec:p});}
  for(const j of spec.joints){const node=object.getObjectByName(j.node);if(!node)throw Error('Missing joint: '+j.node);this.joints.set(j.id,{node,spec:j,position:node.position.clone(),quaternion:node.quaternion.clone(),value:0});}
 }
 setJoint(id,value){
  const j=this.joints.get(id);if(!j)throw Error('Unknown joint: '+id);if(!Number.isFinite(value))throw Error('Joint value must be finite');
  const limits=j.spec.limits;if(limits&&(value<limits.min-1e-7||value>limits.max+1e-7))throw RangeError(`${id} outside [${limits.min}, ${limits.max}]`);
  if(j.spec.type==='prismatic')j.node.position.copy(j.position).addScaledVector(new THREE.Vector3(...j.spec.axis),value);
  else j.node.quaternion.copy(j.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...j.spec.axis),value));
  j.value=value;this.object.updateMatrixWorld(true);return this;
 }
 setCargoHeight(height){const port=this.ports.get('cargo');if(!port||!this.joints.has('lift'))throw Error('No cargo lift on '+this.spec.id);return this.setJoint('lift',height-port.spec.position[1]);}
 configure(parameters){for(const [key,value] of Object.entries(parameters)){
  if(key!=='conveyorHeight')throw Error('Unsupported asset parameter: '+key);
  if(!Number.isFinite(value)||value<0||value>this.spec.dimensions[1])throw RangeError('Invalid conveyorHeight');
  for(const port of this.ports.values())if(port.spec.requiresParameters.includes(key))port.node.position.y=value;
  this.configuredParameters.add(key);
 }this.object.updateMatrixWorld(true);return this;}
 port(id,{allowUnconfigured=false}={}){const p=this.ports.get(id);if(!p)throw Error('Unknown port: '+id);if(!allowUnconfigured)for(const key of p.spec.requiresParameters)if(!this.configuredParameters.has(key))throw Error(`${id} requires ${key}`);return p.node;}
 portPose(id){const node=this.port(id);node.updateWorldMatrix(true,false);return {position:node.getWorldPosition(new THREE.Vector3()),quaternion:node.getWorldQuaternion(new THREE.Quaternion()),normal:new THREE.Vector3(0,0,1).transformDirection(node.matrixWorld)};}
 attachCargo(cargo,{port='cargo',align=true,offset=[0,0,0],payloadAnchor=null}={}){
  const anchor=typeof payloadAnchor==='string'?cargo.getObjectByName(payloadAnchor):payloadAnchor;
  if(payloadAnchor&&!anchor)throw Error('Missing payload anchor: '+payloadAnchor);
  if(anchor){let n=anchor;while(n&&n!==cargo)n=n.parent;if(n!==cargo)throw Error('Payload anchor must belong to cargo');}
  const node=this.port(port);this.object.updateWorldMatrix(true,true);cargo.updateWorldMatrix(true,true);node.attach(cargo);
  if(align){cargo.position.fromArray(offset);const target=this.root.getWorldQuaternion(new THREE.Quaternion()),inverse=node.getWorldQuaternion(new THREE.Quaternion()).invert();cargo.quaternion.copy(inverse.multiply(target));}
  if(align&&anchor){cargo.updateWorldMatrix(true,true);const local=node.worldToLocal(anchor.getWorldPosition(new THREE.Vector3()));cargo.position.add(new THREE.Vector3(...offset).sub(local));}
  this.carried.add(cargo);this.object.updateMatrixWorld(true);return cargo;
 }
 releaseCargo(cargo,parent){if(!this.carried.has(cargo))throw Error('Cargo is not carried by this instance');this.object.updateWorldMatrix(true,true);parent.updateWorldMatrix(true,true);parent.attach(cargo);this.carried.delete(cargo);return cargo;}
 reset(){for(const id of this.joints.keys())this.setJoint(id,0);return this;}
 release(){if(this.carried.size)throw Error('Release cargo before releasing its carrier');if(this.released)return;this.object.removeFromParent();this.library.instances.delete(this);this.released=true;}
}
export function cadPosition(x,y,{elevation=0,unitScale=.001,origin=[0,0]}={}){return [(x-origin[0])*unitScale,elevation,-(y-origin[1])*unitScale];}
export function placeFromCAD(instance,{x,y,rotationDegrees=0,elevation=0,unitScale=.001,origin=[0,0],assetYawOffsetDegrees=0,assetScale=1}){
 if(!(assetScale>0&&Number.isFinite(assetScale)))throw Error('Asset scale must be positive and uniform');
 instance.object.position.fromArray(cadPosition(x,y,{elevation,unitScale,origin}));instance.object.rotation.y=THREE.MathUtils.degToRad(rotationDegrees+assetYawOffsetDegrees);instance.object.scale.setScalar(assetScale);instance.object.updateMatrixWorld(true);return instance;
}
export function connectionGap(a,portA,b,portB){const p=a.portPose(portA),q=b.portPose(portB);return {distance:p.position.distanceTo(q.position),opposedNormals:p.normal.dot(q.normal)};}
