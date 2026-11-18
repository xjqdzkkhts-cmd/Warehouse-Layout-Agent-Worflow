import * as T from '../dist/library/vendor/three/build/three.module.js';
import {mergeGeometries,mergeVertices} from '../dist/library/vendor/three/examples/jsm/utils/BufferGeometryUtils.js';

// Weld positions only for connectivity; retain source normals and UV seams in
// the resulting geometry. This separates feet, profiles and fasteners without
// modifying the independent GLB library.
export function islands(mesh) {
  const g=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
  g.applyMatrix4(mesh.matrixWorld);
  const p=g.attributes.position, count=p.count/3, parent=Array.from({length:count},(_,i)=>i), vertices=new Map();
  const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  for(let i=0;i<p.count;i++){
    const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e5)).join(','),tri=Math.floor(i/3);
    if(vertices.has(key))parent[root(tri)]=root(vertices.get(key));else vertices.set(key,tri);
  }
  const sets=new Map();for(let i=0;i<count;i++){const r=root(i);if(!sets.has(r))sets.set(r,[]);sets.get(r).push(i);}
  const out=[];
  for(const tris of sets.values()){
    const geo=new T.BufferGeometry();
    for(const [name,a] of Object.entries(g.attributes)){
      const data=new Float32Array(tris.length*3*a.itemSize);let k=0;
      for(const tri of tris)for(let v=tri*3;v<tri*3+3;v++)for(let j=0;j<a.itemSize;j++)data[k++]=a.array[v*a.itemSize+j];
      geo.setAttribute(name,new T.BufferAttribute(data,a.itemSize));
    }
    geo.computeBoundingBox();out.push({geometry:geo,material:mesh.material,box:geo.boundingBox.clone()});
  }
  g.dispose();return out;
}

const size=b=>b.getSize(new T.Vector3()),center=b=>b.getCenter(new T.Vector3());
function assembler(id){
  const bins=new Map();
  function add(geometry,material,role){
    let g=geometry.index?geometry.toNonIndexed():geometry;
    for(const name of Object.keys(g.attributes))if(!['position','normal'].includes(name))g.deleteAttribute(name);
    if(!g.attributes.normal)g.computeVertexNormals();
    const key=role+'|'+material.uuid;if(!bins.has(key))bins.set(key,{material,role,geometries:[]});bins.get(key).geometries.push(g);
  }
  function finish(){const root=new T.Group();root.name='asset__'+id;for(const {material,role,geometries}of bins.values()){
    const merged=mergeGeometries(geometries,false),g=mergeVertices(merged,1e-6);merged.dispose();g.computeBoundingBox();g.computeBoundingSphere();const mesh=new T.Mesh(g,material);mesh.name=role;root.add(mesh);geometries.forEach(g=>g.dispose());
  }return root;}
  return {add,finish};
}
function fitted(part,dimensions,position){const s=size(part.box),c=center(part.box);return part.geometry.clone().translate(-c.x,-c.y,-c.z).scale(...dimensions.map((v,i)=>v/Math.max(s.getComponent(i),1e-9))).translate(...position);}
function worldPart(mesh){const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);geometry.computeBoundingBox();return {geometry,material:mesh.material,box:geometry.boundingBox.clone()};}

export function prepareHighConveyors(fork,chain,sourceSpecs){
  fork.scene.updateMatrixWorld(true);chain.scene.updateMatrixWorld(true);
  const body=islands(chain.scene.getObjectByName('chain-short__三链机体001'));
  const links=islands(chain.scene.getObjectByName('chain-short__链条001'));
  const screwParts=islands(chain.scene.getObjectByName('chain-short__螺钉001'));
  const bolt=screwParts.filter(p=>Math.max(...size(p.box).toArray())<.1).sort((a,b)=>b.geometry.attributes.position.count-a.geometry.attributes.position.count)[0];
  if(!bolt)throw Error('High-detail fastener not found');
  const rollerMesh=fork.scene.getObjectByName('fork-roller-conveyor__Cylinder002__island_0'),roller=worldPart(rollerMesh);
  const motor=worldPart(chain.scene.getObjectByName('chain-short__电机001'));
  const sourceReferences=ids=>ids.map(id=>({assetId:id,modelSha256:sourceSpecs.find(s=>s.id===id).modelSha256,library:'asset-library-high'}));
  function rollerLine(id,W,L,H=.8){
    const {add,finish}=assembler(id),r=size(roller.box).x/2,rs=size(roller.box),rc=center(roller.box),rollerWidth=W-.11;
    // Keep both machined ends intact; extend only the straight shaft barrel.
    const unit=roller.geometry.clone().translate(-rc.x,-rc.y,-rc.z),p=unit.attributes.position,core=rs.z/2-.025,delta=(rollerWidth-rs.z)/2;
    for(let i=0;i<p.count;i++){const z=p.getZ(i);p.setZ(i,z+(Math.abs(z)>core?Math.sign(z)*delta:z/core*delta));}
    p.needsUpdate=true;unit.rotateY(Math.PI/2);
    const count=Math.ceil((L-2*r)/.095)+1,pitch=(L-2*r)/(count-1),centers=[];
    for(let i=0;i<count;i++){
      const z=-L/2+r+i*pitch;centers.push(z);add(unit.clone().translate(0,H-r,z),roller.material,'bearing_rollers');
      for(const x of [-1,1])add(fitted(bolt,[.032,.014,.032],[0,0,0]).rotateZ(Math.PI/2).translate(x*(W/2-.01),H-r,z),bolt.material,'roller_fasteners');
    }
    unit.dispose();
    // Reuse open-section high-detail steel rails and adjustable foot assemblies.
    for(const side of [-1,1]){
      add(fitted(body[side>0?2:3],[.09,.18,L],[side*(W/2-.045),H-.115,0]),body[2].material,'steel_frame');
    }
    const feet=Math.max(2,Math.ceil(L/1.35)+1),legZ=Array.from({length:feet},(_,i)=>-L/2+.17+i*(L-.34)/(feet-1));
    for(const z of legZ){
      for(const side of [-1,1])for(const k of (side>0?[8,9,31]:[41,10,32])){
        const part=body[k],c=center(part.box),s=size(part.box);add(fitted(part,[s.x,s.y*(H-.12)/.699,s.z],[side*(W/2-.11)+(c.x-side*.627),c.y*(H-.12)/.699,z+(c.z-.904)]),part.material,'steel_feet');
      }
      add(fitted(body[0],[W-.19,.075,.10],[0,.25,z]),body[0].material,'steel_braces');
    }
    // The drive assembly is below the bearing surface, inside the CAD envelope.
    add(fitted(motor,[W-.07,.43,.46],[0,.39,Math.max(-L/2+.25,-.28)]),motor.material,'drive_motor');
    return {root:finish(),spec:{quality:'high-derived',placementFootprint:[W,L],surfaceHeight:H,ports:{infeed:[0,H,-L/2],outfeed:[0,H,L/2]},rollerAxis:[1,0,0],transportAxis:[0,0,1],rollerDiameter:2*r,rollerPitch:pitch,rollerCenters:centers,reference:{sources:sourceReferences(['fork-roller-conveyor','chain-short']),method:'Original machined roller ends, channel profiles, adjustable feet, fasteners and drive; repeat rollers at fixed diameter, extend only barrel and structural spans'}}};
  }
  function chainLine(id,W,L,H=.8){
    const {add,finish}=assembler(id),dy=H-.92555535,sourceHalfWidth=.73538822,shiftX=W/2-sourceHalfWidth;
    const mapX=x=>Math.abs(x)>.49?x+Math.sign(x)*shiftX:x*(.49+shiftX)/.49;
    const mapZ=z=>Math.abs(z)>.73?z+Math.sign(z)*(L/2-1.23873615):z*(L/2-.50873615)/.73;
    const mapY=y=>y<.024?y:y>.677?y+dy:.024+(y-.024)*(.677+dy-.024)/(.677-.024);
    function warped(part,rigid=false){const g=part.geometry.clone(),a=g.attributes.position,c=center(part.box);for(let i=0;i<a.count;i++){
      const x=a.getX(i),y=a.getY(i),z=a.getZ(i);a.setXYZ(i,rigid?x-c.x+mapX(c.x):mapX(x),rigid?y-c.y+mapY(c.y):mapY(y),rigid?z-c.z+mapZ(c.z):mapZ(z));
    }a.needsUpdate=true;if(!rigid)g.computeVertexNormals();return g;}
    for(const p of body)add(warped(p),p.material,'steel_frame');
    for(const p of screwParts)add(warped(p,size(p.box).y<.1),p.material,'frame_fasteners');
    chain.scene.traverse(n=>{if(!n.isMesh||!n.name.includes('轴001'))return;const p=worldPart(n);add(warped(p),p.material,'drive_shafts');});
    add(motor.geometry.clone().scale((W-.045)/size(motor.box).x,1,1).translate(0,dy,0),motor.material,'drive_motor');
    // Extract one complete, detailed straight link (two side plates + pins).
    // Repeat links instead of stretching the chain mesh with conveyor length.
    const link=mergeGeometries(links.slice(64,68).map(p=>p.geometry.clone()),false);link.computeBoundingBox();const lb=link.boundingBox,ls=size(lb),lc=center(lb);
    link.translate(-lc.x,-lb.max.y,-lc.z);
    const count=Math.ceil((L-ls.z)/.12)+1,pitch=(L-ls.z)/(count-1),lanes=[-.60017+(-shiftX),.60199+shiftX],centers=[];
    for(let i=0;i<count;i++){
      const z=-L/2+ls.z/2+i*pitch;centers.push(z);
      for(const x of lanes){add(link.clone().translate(x,H,z),links[64].material,'bearing_chain_links');add(link.clone().translate(x,H-.166,z),links[64].material,'return_chain_links');}
    }
    for(const side of [-1,1])for(const range of [[20,28],[44,52]]){
      const segment=mergeGeometries(links.slice(...range).map(p=>p.geometry.clone()),false);segment.computeBoundingBox();const b=segment.boundingBox,c=center(b),offset=range[0]===20?-L/2-b.min.z:L/2-b.max.z;
      segment.translate(lanes[side>0?1:0]-c.x,dy,offset);add(segment,links[64].material,'chain_end_returns');
    }
    link.dispose();
    return {root:finish(),spec:{quality:'high-derived',placementFootprint:[W,L],surfaceHeight:H,ports:{infeed:[0,H,-L/2],outfeed:[0,H,L/2]},transportAxis:[0,0,1],chainLanes:lanes,chainPlateOffsets:[-.0385,.0385],chainPitch:pitch,chainCenters:centers,reference:{sources:sourceReferences(['chain-short']),method:'Detailed original chain plates/pins repeated at fixed dimensions, end returns, original drive motor, frame profiles and fasteners; independently fit structural spans and bearing height'}}};
  }
  return {rollerLine,chainLine};
}
