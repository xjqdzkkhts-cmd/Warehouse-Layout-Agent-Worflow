// Fixed UI from the first three-building site. Scene/GLB code stays in adapter.
export const LIGHT_DEFAULTS=Object.freeze({background:'#f4f5f7',color:'#fff8ed',azimuth:-32,elevation:58,strength:3.2,ambient:2.5});
const clone=value=>structuredClone(value);
export function createWarehouseUI({catalog,onAction,capabilities={},storageKey='warehouse-lighting',initialState={}}){
 if(typeof onAction!=='function')throw Error('Scene adapter must provide onAction');
 const $=id=>document.getElementById(id),all=selector=>[...document.querySelectorAll(selector)],abort=new AbortController();
 const required=['viewport','warehouses','floors','devices','walls','goods','grid','orbit','play','speed','loading'];
 for(const id of required)if(!$(id))throw Error('Missing fixed frontend element: '+id);
 const warehouses=catalog.warehouses.map(w=>({...w,id:String(w.id),floors:w.floors.map(f=>({...f,id:String(f.id)}))}));
 const devices=(catalog.devices||[]).map(d=>({...d,id:String(d.id),warehouseId:String(d.warehouseId),floorIds:d.floorIds.map(String)}));
 if(new Set(warehouses.map(w=>w.id)).size!==warehouses.length||warehouses.some(w=>w.id==='all'))throw Error('Warehouse IDs must be unique; all is reserved');
 const caps={logistics:false,production:false,followCargo:false,...capabilities};
 let saved={};try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}');}catch{}
 const state={warehouse:'all',floor:'all',walls:true,goods:true,grid:false,orbit:false,view:'perspective',playing:!matchMedia('(prefers-reduced-motion: reduce)').matches,speed:1,device:null,followCargo:false,autoLogistics:false,logisticsBusy:false,activeLogistics:null,...initialState,lighting:{...LIGHT_DEFAULTS,...saved,...initialState.lighting}};
 let disposed=false,revision=0,scope='',timer;
 const listen=(node,type,fn)=>node.addEventListener(type,fn,{signal:abort.signal});
 function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(timer);timer=setTimeout(()=>$('toast').classList.remove('show'),2200);}
 function render(){
  all('[data-wh]').forEach(b=>{const selected=b.dataset.wh===state.warehouse;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
  const nextScope=[state.warehouse,state.floor,state.device].join('|');
  if(nextScope!==scope){scope=nextScope;$('floors').replaceChildren();
   const floors=[{id:'all',label:'全部'},...(warehouses.find(w=>w.id===state.warehouse)?.floors||[])];
   for(const f of floors){const b=document.createElement('button');b.textContent=f.label;b.dataset.floor=f.id;b.classList.toggle('active',f.id===state.floor);b.setAttribute('aria-pressed',String(f.id===state.floor));$('floors').append(b);}
   $('devices').replaceChildren();for(const d of devices.filter(d=>(state.warehouse==='all'||d.warehouseId===state.warehouse)&&(state.floor==='all'||d.floorIds.includes(state.floor)))){
    const b=document.createElement('button'),dot=document.createElement('i');dot.className='device-dot';b.append(dot,document.createTextNode(d.label));b.dataset.device=d.id;b.classList.toggle('active',d.id===state.device);b.setAttribute('aria-pressed',String(d.id===state.device));$('devices').append(b);
   }
  }
  for(const id of ['walls','goods','grid','orbit'])$(id).checked=state[id];
  all('[data-view]').forEach(b=>{const active=b.dataset.view===state.view;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  $('play').textContent=state.playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',state.playing?'暂停':'播放');$('speed').value=String(state.speed);
  for(const [id,key]of [['auto-logistics','autoLogistics'],['follow-cargo','followCargo']]){$(id).classList.toggle('active',state[key]);$(id).setAttribute('aria-pressed',String(state[key]));}
  for(const [id,kind]of [['inbound','in'],['outbound','out']]){$(id).disabled=!caps.logistics||state.logisticsBusy;$(id).classList.toggle('active',state.activeLogistics===kind);}
  for(const id of ['auto-logistics','reset-logistics','focus-logistics'])$(id).disabled=!caps.logistics;
  $('focus-production').disabled=!caps.production;$('follow-cargo').disabled=!caps.followCargo;
  $('background-color').value=state.lighting.background;$('light-color').value=state.lighting.color;
  for(const [id,key,unit]of [['azimuth','azimuth','°'],['elevation','elevation','°'],['light-strength','strength',''],['ambient-strength','ambient','']]){$(id).value=state.lighting[key];$(id+'-value').textContent=state.lighting[key]+unit;}
  all('[data-bg]').forEach(b=>b.classList.toggle('active',b.dataset.bg===state.lighting.background));
 }
 function update(patch){if(disposed)return;Object.assign(state,{...patch,lighting:{...state.lighting,...patch.lighting}});revision++;render();}
 function dispatch(type,payload={},patch={}){
  if(disposed)return;const before=clone(state);update(patch);const current=revision,snapshot=clone(state);
  Promise.resolve().then(()=>onAction({type,...payload},snapshot)).catch(error=>{
   if(disposed)return;if(current===revision){Object.assign(state,before);render();}toast('操作未完成，请重试');console.error(error);
  });
 }
 const stopFollow={followCargo:false,orbit:false};
 $('warehouses').replaceChildren();
 for(const w of [{id:'all',label:catalog.overviewLabel||'园区总览'},...warehouses]){
  const b=document.createElement('button'),icon=document.createElement('span'),arrow=document.createElement('span');b.className='warehouse';b.dataset.wh=w.id;icon.className='nav-icon';icon.textContent=w.id==='all'?'▦':'▥';arrow.className='nav-arrow';arrow.textContent='↗';b.append(icon,document.createTextNode(w.label),arrow);$('warehouses').append(b);
 }
 listen($('warehouses'),'click',e=>{const b=e.target.closest('[data-wh]');if(b)dispatch('select-warehouse',{id:b.dataset.wh},{warehouse:b.dataset.wh,floor:'all',device:null,...stopFollow});});
 listen($('floors'),'click',e=>{const b=e.target.closest('[data-floor]');if(b)dispatch('select-floor',{id:b.dataset.floor},{floor:b.dataset.floor,device:null,...stopFollow});});
 listen($('devices'),'click',e=>{const b=e.target.closest('[data-device]');if(!b)return;const d=devices.find(d=>d.id===b.dataset.device);dispatch('focus-device',{id:d.id},{warehouse:d.warehouseId,floor:String(d.focusFloor??d.floorIds[0]??'all'),device:d.id,walls:false,...stopFollow});});
 all('[data-view]').forEach(b=>listen(b,'click',()=>dispatch('view',{view:b.dataset.view},{view:b.dataset.view,...stopFollow})));
 for(const id of ['walls','goods','grid'])listen($(id),'change',e=>dispatch('visibility',{key:id,value:e.target.checked},{[id]:e.target.checked}));
 listen($('orbit'),'change',e=>dispatch('orbit',{enabled:e.target.checked},{orbit:e.target.checked,followCargo:false}));
 listen($('play'),'click',()=>dispatch('playback',{}, {playing:!state.playing}));
 listen($('speed'),'change',e=>dispatch('playback',{}, {speed:Number(e.target.value)}));
 listen($('focus'),'click',()=>dispatch('fit',{},stopFollow));
 listen($('zoom-in'),'click',()=>dispatch('zoom',{factor:.8}));listen($('zoom-out'),'click',()=>dispatch('zoom',{factor:1.25}));
 listen($('devices-toggle'),'click',()=>{$('devices').hidden=!$('devices').hidden;$('devices-toggle').setAttribute('aria-expanded',String(!$('devices').hidden));});
 listen($('viewport'),'keydown',e=>{if(e.code==='Space'){e.preventDefault();$('play').click();}if(e.code==='KeyR')dispatch('fit',{},stopFollow);});
 function light(patch){const lighting={...state.lighting,...patch};try{localStorage.setItem(storageKey,JSON.stringify(lighting));}catch{}dispatch('lighting',{}, {lighting});}
 for(const [id,key]of [['background-color','background'],['light-color','color']])listen($(id),'input',e=>light({[key]:e.target.value}));
 for(const [id,key]of [['azimuth','azimuth'],['elevation','elevation'],['light-strength','strength'],['ambient-strength','ambient']])listen($(id),'input',e=>light({[key]:Number(e.target.value)}));
 all('[data-bg]').forEach(b=>listen(b,'click',()=>light({background:b.dataset.bg})));listen($('reset-lighting'),'click',()=>light({...LIGHT_DEFAULTS}));
 for(const [id,command]of [['inbound','inbound'],['outbound','outbound'],['reset-logistics','reset'],['focus-logistics','focus'],['focus-production','production']])listen($(id),'click',()=>dispatch('logistics',{command}));
 listen($('auto-logistics'),'click',()=>dispatch('logistics',{command:'auto',enabled:!state.autoLogistics},{autoLogistics:!state.autoLogistics}));
 listen($('follow-cargo'),'click',()=>dispatch('logistics',{command:'follow',enabled:!state.followCargo},{followCargo:!state.followCargo,orbit:false}));
 render();return{snapshot:()=>clone(state),update,toast,ready(){ $('loading').style.display='none';document.body.dataset.ready='true';},dispose(){disposed=true;abort.abort();clearTimeout(timer);}};
}
