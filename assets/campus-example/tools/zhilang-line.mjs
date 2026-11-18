// CAD-sized variants of the independent conveyor-zhilang GLB. Keep its real
// channel profiles, end tray, guides, grey supports and original materials.
export function zhilangLine({T,source,add,box,length,width,height,branch=null}){
 source.scene.updateMatrixWorld(true);
 const C=.19332312,SW=.46154130,SL=2.16409898,sourceTop=.442611724,dy=height-sourceTop;
 const material=source.scene.getObjectByName('conveyor-zhilang__Cube107').material;
 const mapY=y=>y<.30?y*(.30+dy)/.30:y+dy;
 function piece(name,{long=false,z=null,branchPart=false}={}){
  const node=source.scene.getObjectByName('conveyor-zhilang__'+name);
  if(!node?.isMesh)throw Error('Missing Zhilang source part '+name);
  const g=node.geometry.clone().applyMatrix4(node.matrixWorld);g.computeBoundingBox();
  const b=g.boundingBox,c=b.getCenter(new T.Vector3()),size=b.getSize(new T.Vector3()),a=g.attributes.position;
  for(let i=0;i<a.count;i++){
   const sx=a.getX(i),sy=a.getY(i),sz=a.getZ(i);let x=(sx-C)*width/SW,zz;
   if(branchPart){
    x=-width/2-(b.max.x-sx)/size.x*branch.length;
    zz=branch.center+(sz-c.z)*branch.width/size.z;
   }else if(long){
    const lo=-length/2+(b.min.z+SL/2),hi=length/2-(SL/2-b.max.z);
    zz=lo+(sz-b.min.z)/size.z*(hi-lo);
   }else{
    const target=z??(c.z>=0?length/2-(SL/2-c.z):-length/2+(c.z+SL/2));
    zz=target+(sz-c.z);
   }
   // Source +Z transport axis becomes the CAD block's +X axis.
   a.setXYZ(i,zz,mapY(sy),-x);
  }
  a.needsUpdate=true;g.computeVertexNormals();add(g,node.material);
 }
 piece('Cube107',{long:true});piece('Cube110',{long:true});
 piece('Cube108');piece('Cube109');
 const count=Math.ceil((length-.20)/.95)+1;
 for(let i=0;i<count;i++)piece('Cube106',{z:-length/2+.10+i*(length-.20)/(count-1)});
 const guides=Math.ceil((length-.16)/.65)+1;
 for(let i=0;i<guides;i++)piece('Cube105',{z:-length/2+.08+i*(length-.16)/(guides-1)});
 if(branch)piece('Cube112',{branchPart:true});
 // The CAD-specific bearing surface is assembled separately from the source
// frame so rail height/guards never determine a bin's support elevation.
 return {material,top:mapY(.497846667),sourceAsset:'conveyor-zhilang'};
}
