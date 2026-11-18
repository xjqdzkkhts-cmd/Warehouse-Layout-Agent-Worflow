// Approved visual reconstruction from four CAD symbols. Geometry does not
// assign inventory flow, machine function or the reference site's dimensions.
import {zhilangLine} from './zhilang-line.mjs';
export async function buildProcessShapes({T,layout,box,bar,add,batch,write,roller,rollerParts,steel,blue,dark,zhilang,zhilangSpec}){
 const shape=(name)=>layout.placements.find(p=>p.sourceBlock===name);
 const ref=(name)=>({status:'shape-approved-process-unconfirmed',processUse:'unconfirmed',reference:{source:layout.source,sourceSha256:layout.sourceSha256,block:name,method:'CAD plan shape + user-approved typical Zhilang station reference; no process semantics'},placementFootprint:shape(name).size});
 function parts(data,yaw=0,position=[0,0,0]){for(const p of data.parts){if(p.role==='surface'){const g=p.geometry.clone().rotateY(yaw).translate(...position);add(g,p.material);}p.geometry.dispose();}}
 const lineReference={assetId:'conveyor-zhilang',modelSha256:zhilangSpec.modelSha256,method:'original independent GLB frame/end-tray/guide/support geometry; CAD-sized bearing surfaces'};
 const belt=new T.MeshStandardMaterial({name:'belt_surface',color:0x66727a,roughness:.82}),yellow=new T.MeshStandardMaterial({name:'gate_frame',color:0xe1ac42,roughness:.6,metalness:.2}),top=new T.MeshStandardMaterial({name:'station_top',color:0xc8cecf,roughness:.6});
 {const [W,D]=shape('KXF').size;
  zhilangLine({T,source:zhilang,add,box,length:W,width:D,height:.8});
  for(const [a,b]of [[-W/2,.89],[1.29,W/2]])box(b-a,.035,D-.09,(a+b)/2,.7825,0,belt);
  parts(rollerParts(roller,D,.40,.8),Math.PI/2,[1.09,0,0]);
  const displayCargo=[-1.46,-.73,0,.73,1.46].map((x,i)=>({id:'bin-'+(i+1),asset:'bin',position:[x,.8,0],yaw:Math.PI/2,scale:1.25}));
  await write('cad-kxf',batch('cad-kxf'),{...ref('KXF'),status:'user-confirmed-conveyor-with-bins',sourceAsset:lineReference,surfaceHeight:.8,displayCargo,geometryPorts:{endA:[-W/2,.8,0],endB:[W/2,.8,0]}});
 }
 {const [L,D]=shape('DYF').size,mainW=.78,mainZ=-D/2+mainW/2,branchStart=-D/2+mainW,branchLength=D-mainW;
  const bx=L/2-.52,bz=(branchStart+D/2)/2,bw=.68;
  const shiftedAdd=(g,m)=>{g.translate(0,0,mainZ);add(g,m);};
  zhilangLine({T,source:zhilang,add:shiftedAdd,box,length:L,width:mainW,height:.8,branch:{length:branchLength,width:bw,center:bx}});
  parts(rollerParts(roller,mainW,L,.8),Math.PI/2,[0,0,mainZ]);
  box(bw,.045,branchLength,bx,.7775,bz,belt);
  for(const s of [-1,1])for(const z of [branchStart+.08,D/2-.06])box(.045,.72,.045,bx+s*(bw/2-.045),.36,z,dark);
  box(bw,.018,mainW-.07,bx,.791,mainZ,steel);
  await write('cad-dyf',batch('cad-dyf'),{...ref('DYF'),sourceAsset:lineReference,surfaceHeight:.8,geometryPorts:{endA:[-L/2,.8,mainZ],endB:[L/2,.8,mainZ],side:[bx,.8,D/2]}});
 }
 {const [W,D]=shape('ZFS').size;
  box(W,.04,D,0,.83,0,top);
  for(const x of [-1,1])for(const z of [-1,1]){box(.045,.81,.045,x*(W/2-.07),.405,z*(D/2-.07));box(.07,.02,.07,x*(W/2-.07),.01,z*(D/2-.07),dark);}
  for(const z of [-1,1])box(W-.10,.05,.035,0,.68,z*(D/2-.07));
  // The narrow side compartment is represented as an inset tray, not a cabinet.
  box(W-.12,.008,.23,0,.854,-D/2+.145,dark);
  for(const x of [-1,1])box(.025,.04,.28,x*(W/2-.05),.86,-D/2+.15,steel);
  await write('cad-zfs',batch('cad-zfs'),{...ref('ZFS'),surfaceHeight:.85});
 }
 {const [W,D]=shape('JL1000Y').size,z=-D/2+.19,H=1.1;
  for(const s of [-1,1]){box(.075,H,.075,s*(W/2-.06),H/2,z,dark);box(.12,.025,.14,s*(W/2-.06),.0125,z);}
  const innerW=W-.22;
  for(const y of [.17,.98])box(innerW,.035,.035,0,y,z,yellow);
  for(const x of [-innerW/2,innerW/2])box(.035,.84,.035,x,.575,z,yellow);
  for(let x=-innerW/2+.09;x<innerW/2;x+=.10)box(.008,.78,.008,x,.575,z,dark);
  box(.025,.14,.07,-innerW/2+.06,.68,z+.035,dark);
  await write('cad-jl1000y',batch('cad-jl1000y'),{...ref('JL1000Y'),coordinateSystem:{units:'meter',up:'+Y',origin:'CAD footprint centre at floor; open-sweep arc is not geometry'},doorSweep:'reserved in layout only; not a solid mesh'});
 }
}
