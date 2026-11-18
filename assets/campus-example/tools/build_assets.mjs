import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import * as T from '../dist/library/vendor/three/build/three.module.js';
import {GLTFLoader} from '../dist/library/vendor/three/examples/jsm/loaders/GLTFLoader.js';
import {GLTFExporter} from '../dist/library/vendor/three/examples/jsm/exporters/GLTFExporter.js';
import {mergeGeometries} from '../dist/library/vendor/three/examples/jsm/utils/BufferGeometryUtils.js';
const base=new URL('../dist/library/',import.meta.url),source=new URL('../../asset-library-high/',import.meta.url),low=new URL('../../asset-library/',import.meta.url);
const layout=JSON.parse(await fs.readFile(new URL('../dist/data/layout.json',import.meta.url))),original=JSON.parse(await fs.readFile(new URL('manifest.json',source)));
globalThis.FileReader=class{readAsArrayBuffer(b){b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();});}readAsDataURL(b){b.arrayBuffer().then(r=>{this.result='data:'+b.type+';base64,'+Buffer.from(r).toString('base64');this.onloadend?.();});}};
for(const d of ['models/','specs/'])await fs.mkdir(new URL(d,base),{recursive:true});
const needed=new Set([...layout.placements.map(p=>p.asset),'bin','blue-pallet']),manifest={version:'campus-1.0.0',coordinateSystem:{units:'meter',up:'+Y'},assets:[]};
for(const a of original.assets)if(needed.has(a.id)){
 await fs.copyFile(new URL(a.model,source),new URL(a.model,base));await fs.copyFile(new URL(a.spec,source),new URL(a.spec,base));manifest.assets.push(a);
}
const steel=new T.MeshStandardMaterial({name:'galvanized_steel',color:0xb2bdc2,metalness:.55,roughness:.48}),blue=new T.MeshStandardMaterial({name:'beam_blue',color:0x326992,metalness:.3,roughness:.45}),dark=new T.MeshStandardMaterial({name:'graphite',color:0x4e5a62,metalness:.35,roughness:.48});
const bucket=new Map();
function add(g,mat){if(g.index)g=g.toNonIndexed();if(!bucket.has(mat))bucket.set(mat,[]);bucket.get(mat).push(g);}
function box(w,h,d,x,y,z,mat=steel){add(new T.BoxGeometry(w,h,d).translate(x,y,z),mat);}
function bar(a,b,w,d,mat=steel){const delta=new T.Vector3(...b).sub(new T.Vector3(...a)),g=new T.BoxGeometry(w,delta.length(),d),q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());g.applyQuaternion(q).translate(...a.map((v,i)=>(v+b[i])/2));add(g,mat);}
function batch(id){const root=new T.Group();root.name='asset__'+id;for(const [mat,geoms]of bucket){const g=mergeGeometries(geoms,false),m=new T.Mesh(g,mat);m.name=id+'_'+mat.name;root.add(m);geoms.forEach(g=>g.dispose());}bucket.clear();return root;}
async function write(id,root,extra={},animations=[]){
 root.updateMatrixWorld(true);const b=new T.Box3().setFromObject(root,true),dims=b.getSize(new T.Vector3()).toArray();let triangles=0,meshCount=0;root.traverse(n=>{if(n.isMesh){triangles+=(n.geometry.index?.count||n.geometry.attributes.position.count)/3;meshCount++;}});
 const bytes=Buffer.from(await new GLTFExporter().parseAsync(root,{binary:true,trs:true,onlyVisible:true,animations})),model='models/'+id+'.glb',specPath='specs/'+id+'.json';
 const spec={id,model,dimensions:dims,coordinateSystem:{units:'meter',up:'+Y',origin:'bottom-center'},statistics:{triangles,meshCount},modelBytes:bytes.length,modelSha256:crypto.createHash('sha256').update(bytes).digest('hex'),...extra};
 await fs.writeFile(new URL(model,base),bytes);await fs.writeFile(new URL(specPath,base),JSON.stringify(spec,null,2));manifest.assets.push({...spec,spec:specPath});console.log(id,triangles,bytes.length);
}
function rack(id,W,D,H,levels,kind){
 const bin=kind==='bin',post=bin?.045:.075,foot=bin?.08:.14,x=(W-foot)/2,z=(D-foot)/2,surfaces=Array.from({length:levels},(_,i)=>bin?.24+i*(H-.62)/levels:.24+i*2);
 for(const sx of [-1,1])for(const sz of [-1,1]){box(post,H-.03,post,sx*x,(H+.03)/2,sz*z);box(foot,.03,foot,sx*x,.015,sz*z);}
 for(const sx of [-1,1]){
  const count=Math.ceil(H/1.6);for(let i=0;i<count;i++){const a=.18+i*(H-.35)/count,b=.18+(i+1)*(H-.35)/count;bar([sx*x,a,i%2?z:-z],[sx*x,b,i%2?-z:z],bin?.018:.028,.018);}
 }
 for(const y of surfaces){
  if(kind==='dense')for(const sx of [-1,1]){box(.075,.08,D-.08,sx*(x-.05),y-.04,0,blue);box(.10,.025,D-.08,sx*(x-.04),y+.0125,0,steel);}
  else for(const sz of [-1,1])box(W-post,.09,bin?.035:.07,0,y-.045,sz*z,blue);
  if(bin){for(const sx of [-1,1])box(.04,.035,D-post,sx*x,y-.018,0);box(W-.08,.022,D-.08,0,y-.011,0,steel);}
  else for(const k of [-.27,.27])box(.06,.035,D-.08,W*k,y-.018,0,steel);
 }
 const root=batch(id);return {root,surfaces:kind==='dense'?surfaces.map(y=>y+.025):surfaces};
}
for(const [id,W,D,H,levels,kind]of [['beam-rack-4',2.88,1.4,8,4,'beam'],['beam-rack-5',2.88,1.4,10,5,'beam'],['dense-rack-4',1.1495,1.53,8,4,'dense'],['bin-rack-double',2.07,1.27,10.8,18,'bin'],['bin-rack-single',2.07,.63,10.8,18,'bin']]){
 const {root,surfaces}=rack(id,W,D,H,levels,kind);await write(id,root,{storageSurfaces:surfaces,reference:{assetId:kind==='beam'?'beam-rack':'rack-four-way',sha256:original.assets.find(a=>a.id===(kind==='beam'?'beam-rack':'rack-four-way')).modelSha256,method:'CAD-specific parametric structure, follows independent library rack profiles; not stretched original storage levels'},parameters:{levels,height:H,width:W,depth:D}});
}
// The continuous roller modules reuse actual parts from the independent GLB
// library, so the loaded model extends to the declared handoff surface.
const load=async(base,name)=>{const b=await fs.readFile(new URL('models/'+name+'.glb',base));return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
// Full racks contain tens of thousands of identical bins. Use the independent
// library's compact shell for rack cargo, retaining detailed bins on vehicles.
await write('bin-display',(await load(low,'bin')).scene,{reference:{assetId:'bin',library:'asset-library',method:'original compact GLB shell; same measured dimensions as high detail bin'}});
const roller=await load(low,'roller-conveyor');
const helper=(await fs.readFile(new URL('runtime/ConveyorGeometry.js',low),'utf8')).replace("from 'three'",`from '${new URL('vendor/three/build/three.module.js',base).href}'`).replace("from 'three/addons/utils/BufferGeometryUtils.js'",`from '${new URL('vendor/three/examples/jsm/utils/BufferGeometryUtils.js',base).href}'`);
const {rollerParts}=await import('data:text/javascript;base64,'+Buffer.from(helper).toString('base64'));
const {prepareHighConveyors}=await import('./high-conveyors.mjs');
const highConveyors=prepareHighConveyors(await load(source,'fork-roller-conveyor'),await load(source,'chain-short'),original.assets);
const rollerVariants=new Map(layout.placements.filter(p=>p.asset.startsWith('continuous-roller')).map(p=>[p.asset,p.size]));
const chainVariants=new Map(layout.placements.filter(p=>p.asset.startsWith('continuous-chain')).map(p=>[p.asset,p.size]));
for(const [variants,builder]of [[rollerVariants,highConveyors.rollerLine],[chainVariants,highConveyors.chainLine]])for(const [id,[w,l]]of variants){
 const {root,spec}=builder(id,w,l,.8);await write(id,root,spec);
}
const {buildProcessShapes}=await import('./process-shapes.mjs');
await buildProcessShapes({T,layout,box,bar,add,batch,write,roller,rollerParts,steel,blue,dark,zhilang:await load(source,'conveyor-zhilang'),zhilangSpec:original.assets.find(a=>a.id==='conveyor-zhilang')});
// Extend only the fixed mast columns. Keep the moving carrier's vertical size
// and source joint ownership; uniformly stretching it would create a 3.6 m box.
{
 const sourceMast=await load(source,'zhilang-large'),p=layout.placements.find(p=>p.role==='zhilang-mast'),root=new T.Group(),travel=new T.Group(),lift=new T.Group();root.name='asset__zhilang-mast-campus';travel.name='joint__travel';lift.name='joint__lift';root.add(travel);travel.add(lift);
 sourceMast.scene.updateMatrixWorld(true);const srcLift=sourceMast.scene.getObjectByName('joint__lift'),srcBox=new T.Box3().setFromObject(sourceMast.scene,true),srcSize=srcBox.getSize(new T.Vector3()),lb=new T.Box3().setFromObject(srcLift,true),H=p.height,W=p.size[0],D=p.size[1];
 sourceMast.scene.traverse(n=>{if(!n.isMesh)return;let parent=n,moving=false;while(parent){if(parent===srcLift)moving=true;parent=parent.parent;}
  const g=n.geometry.clone().applyMatrix4(n.matrixWorld),a=g.attributes.position;
  for(let i=0;i<a.count;i++){const y=a.getY(i);a.setXYZ(i,a.getX(i)*W/srcSize.x,moving?y-lb.min.y+.23:y<.15?y:y>.71?H-(srcSize.y-y):.15+(y-.15)*(H-.15-(srcSize.y-.71))/.56,a.getZ(i)*D/srcSize.z);}a.needsUpdate=true;g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new T.Mesh(g,n.material);mesh.name=n.name;(moving?lift:travel).add(mesh);
 });
 const stroke=H-.04-(.23+lb.max.y-lb.min.y),times=[],values=[];
 for(let i=0;i<=120;i++){const u=i/120;times.push(u*14);values.push(0,stroke*(1-Math.cos(2*Math.PI*u))/2,0);}
 const clip=new T.AnimationClip('升降循环',14,[new T.VectorKeyframeTrack('joint__lift.position',times,values)]);
 await write('zhilang-mast-campus',root,{reference:{assetId:'zhilang-large',modelSha256:original.assets.find(a=>a.id==='zhilang-large').modelSha256,method:'CAD footprint + approved 10.8 m rack height; fixed columns extended, carrier height preserved'},joints:[{id:'travel',node:'joint__travel',axis:[1,0,0],parent:'root'},{id:'lift',node:'joint__lift',axis:[0,1,0],parent:'travel',limits:{min:0,max:stroke}}],carrierRestHeight:.23,carrierHeight:lb.max.y-lb.min.y,animations:[{name:clip.name,duration:clip.duration}]},[clip]);
}
await fs.writeFile(new URL('manifest.json',base),JSON.stringify(manifest,null,2));
console.log('LIBRARY',manifest.assets.length,'assets',manifest.assets.reduce((s,a)=>s+a.modelBytes,0),'bytes');
