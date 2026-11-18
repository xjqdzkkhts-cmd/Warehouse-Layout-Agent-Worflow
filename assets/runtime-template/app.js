import {createWarehouseUI} from './ui.js?v=20261112-11';
// Each CAD project supplies scene-adapter.js. It loads independent GLBs and
// implements scene actions; the fixed frontend never reads an old site export.
const viewport=document.getElementById('viewport'),loading=document.getElementById('loading');
let adapter,ui,unsubscribe,disposed=false;
window.addEventListener('pagehide',()=>{disposed=true;unsubscribe?.();ui?.dispose();adapter?.dispose();},{once:true});
try{
 const {createSceneAdapter}=await import('./scene-adapter.js?v=20261112-11');
 adapter=await createSceneAdapter({viewport,onProgress:value=>document.getElementById('progress').value=value});
 if(disposed){adapter.dispose();}else{
  ui=createWarehouseUI({catalog:adapter.catalog,capabilities:adapter.capabilities,initialState:adapter.initialState,storageKey:adapter.storageKey||'warehouse-lighting',onAction:(action,state)=>adapter.dispatch(action,state)});
  unsubscribe=adapter.subscribe?.(patch=>ui.update(patch));
  await adapter.dispatch({type:'initialize'},ui.snapshot());if(!disposed)ui.ready();
 }
}catch(error){
 if(!disposed){loading.children[1].textContent='模型加载失败';const retry=document.getElementById('retry');retry.hidden=false;retry.onclick=()=>location.reload();}
 console.error(error);
}
