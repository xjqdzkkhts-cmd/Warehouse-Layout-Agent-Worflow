import * as T from './library/vendor/three/build/three.module.js';
import {RoomEnvironment} from './library/vendor/three/examples/jsm/environments/RoomEnvironment.js';
import {EffectComposer} from './library/vendor/three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from './library/vendor/three/examples/jsm/postprocessing/RenderPass.js';
import {GTAOPass} from './library/vendor/three/examples/jsm/postprocessing/GTAOPass.js';
import {OutputPass} from './library/vendor/three/examples/jsm/postprocessing/OutputPass.js';
import {ShaderPass} from './library/vendor/three/examples/jsm/postprocessing/ShaderPass.js';
import {FXAAShader} from './library/vendor/three/examples/jsm/shaders/FXAAShader.js';

export function createRenderQuality(renderer,scene,camera){
 // Floating point, room-shaped studio radiance; the visible background stays
 // independent. No remote HDR fetch or texture CORS dependency at export time.
 const room=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer),env=pmrem.fromScene(room,.06);
 room.dispose();pmrem.dispose();scene.environment=env.texture;scene.environmentIntensity=.75;scene.environmentRotation.y=.45;
 const noise=new Uint8Array(128*128*4);let seed=7124;
 for(let i=0;i<noise.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const v=206+(seed>>>27);noise.set([v,v,v,255],i);}
 const grain=new T.DataTexture(noise,128,128,T.RGBAFormat);grain.wrapS=grain.wrapT=T.RepeatWrapping;grain.repeat.set(120,120);grain.magFilter=T.LinearFilter;grain.minFilter=T.LinearMipmapLinearFilter;grain.generateMipmaps=true;grain.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());grain.needsUpdate=true;
 const calibrated=new Set();
 function materials(root,asset=''){
  root.traverse(n=>{if(!n.isMesh)return;for(const m of [].concat(n.material)){
   if(!m.isMeshStandardMaterial||calibrated.has(m))continue;calibrated.add(m);const name=m.name.toLowerCase();
   if(asset==='bin'||asset==='bin-display'){m.metalness=.02;m.roughness=.58;}
   else if(/rubber|轮胎|rubber|tire/.test(name)){m.metalness=0;m.roughness=.88;}
   else if(/red metal|beam_blue|blue|paint|喷漆/.test(name)){m.metalness=.16;m.roughness=.35;}
   else if(/galvanized|steel|滚筒|silver|铝/.test(name)){m.metalness=.72;m.roughness=.32;}
   else if(/gray metal|graphite/.test(name)){m.metalness=.50;m.roughness=.42;}
   if(name==='concrete'){m.metalness=.02;m.roughness=.87;m.roughnessMap=grain;m.bumpMap=grain;m.bumpScale=.007;}
   if(name==='warehouse-wall'){m.metalness=.08;m.roughness=.72;}
   m.needsUpdate=true;
  }});
 }
 const target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,samples:Math.min(2,renderer.capabilities.maxSamples)});
 renderer.info.autoReset=false;
 const composer=new EffectComposer(renderer,target),renderPass=new RenderPass(scene,camera),ao=new GTAOPass(scene,camera,1,1),output=new OutputPass(),fxaa=new ShaderPass(FXAAShader);
 ao.updateGtaoMaterial({radius:.55,distanceExponent:1.5,thickness:.65,distanceFallOff:1,scale:1,samples:8,screenSpaceRadius:false});ao.blendIntensity=.8;ao.updatePdMaterial({radius:4,samples:8});
 composer.addPass(renderPass);composer.addPass(ao);composer.addPass(output);composer.addPass(fxaa);
 let width=1,height=1,exporting=false,activeAO=false;
 function resize(w,h,dpr=renderer.getPixelRatio(),still=false){width=w;height=h;composer.setPixelRatio(dpr);composer.setSize(w,h);const aw=Math.min(Math.round(w*dpr*(still?.5:.7)),1920),ah=Math.max(1,Math.round(aw*h/w));ao.setSize(aw,ah);fxaa.uniforms.resolution.value.set(1/(w*dpr),1/(h*dpr));}
 function render({contact=true,distance=0,still=false}={}){
  activeAO=contact&&(distance<220||still);ao.enabled=activeAO;renderer.info.reset();composer.render();
 }
 function shadowSize(light,size){if(light.shadow.mapSize.x===size)return;light.shadow.map?.dispose();light.shadow.map=null;light.shadow.mapSize.set(size,size);light.shadow.needsUpdate=true;}
 async function exportPNG({light,contact,distance,before,after}){
  if(exporting)return;exporting=true;
  const old={width,height,dpr:renderer.getPixelRatio(),aspect:camera.aspect,shadow:light.shadow.mapSize.x,ao:ao.enabled,target:renderer.getRenderTarget()};
  const started=performance.now();let blob;
  try{
   if(renderer.capabilities.maxTextureSize<3840||renderer.getContext().getParameter(renderer.getContext().MAX_RENDERBUFFER_SIZE)<3840)throw Error('此设备不支持单张 4K 导出');
   before?.();await new Promise(requestAnimationFrame);
   renderer.setPixelRatio(1);renderer.setSize(3840,2160,false);camera.aspect=16/9;camera.updateProjectionMatrix();resize(3840,2160,1,true);shadowSize(light,Math.min(4096,renderer.capabilities.maxTextureSize));
   render({contact,distance,still:true});
   blob=await new Promise((resolve,reject)=>renderer.domElement.toBlob(b=>b?resolve(b):reject(Error('PNG 编码失败')),'image/png'));
  }finally{
   camera.aspect=old.aspect;camera.updateProjectionMatrix();renderer.setPixelRatio(old.dpr);renderer.setSize(old.width,old.height,false);resize(old.width,old.height,old.dpr);shadowSize(light,old.shadow);ao.enabled=old.ao;renderer.setRenderTarget(old.target);exporting=false;after?.();
  }
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='仓库方案-4K-'+new Date().toISOString().replace(/[:.]/g,'-')+'.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  return {width:3840,height:2160,bytes:blob.size,elapsedMs:Math.round(performance.now()-started)};
 }
 return {materials,resize,render,exportPNG,get exporting(){return exporting;},get aoActive(){return activeAO;},dispose(){composer.passes.forEach(p=>p.dispose?.());composer.dispose();env.dispose();grain.dispose();}};
}
