// Adapted concepts from 项目理解V2/warehouseSimulation.ts and Warehouse3D.tsx:
// 4-neighbour A*, old/new-cell reservation, frame interpolation, shortest yaw.
// CAD Y maps to -world Z here; heading is atan2(world dx, world dz).
export const angleDelta=(to,from)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
class MinHeap{
 constructor(){this.a=[];}
 push(v){const a=this.a;a.push(v);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p][0]<=v[0])break;a[i]=a[p];i=p;}a[i]=v;}
 pop(){const a=this.a,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1][0]<a[c][0])c++;if(a[c][0]>=last[0])break;a[i]=a[c];i=c;}a[i]=last;}return first;}
}
export function findPath(nav,start,goal,blocked=new Set()){
 if(start===goal)return [];
 const cost=new Map([[start,0]]),parent=new Map(),closed=new Set(),open=new MinHeap(),h=n=>Math.abs(nav.points[n][0]-nav.points[goal][0])+Math.abs(nav.points[n][1]-nav.points[goal][1]);open.push([h(start),start]);
 while(open.a.length){const [,n]=open.pop();if(closed.has(n))continue;if(n===goal){const result=[];let c=n;while(c!==start){result.push(c);c=parent.get(c);}return result.reverse();}closed.add(n);
  for(const next of nav.neighbors[n]){if(closed.has(next)||blocked.has(next))continue;const g=cost.get(n)+nav.cellSize;if(g<(cost.get(next)??Infinity)){cost.set(next,g);parent.set(next,n);open.push([g+h(next),next]);}}
 }return null;
}
export function createFleet(nav,placements){
 const occupied=new Map(),agents=[],byId=new Map();let clock=0,turn=0,accumulator=0;
 for(const p of placements){if(p.motion?.kind!=='navigation')continue;const node=p.motion.start,[x,z]=nav.points[node],a={id:p.id,node,next:null,goal:null,path:[],x,z,yaw:p.yaw*Math.PI/180,progress:0,mode:'waiting',wait:0,replanAt:0,trip:0,distance:0,speed:p.motion.speed,turnRate:p.motion.turnRate};occupied.set(node,a.id);agents.push(a);byId.set(a.id,a);}
 function plan(a,index){
  const blocked=new Set([...occupied].filter(([n,id])=>id!==a.id).map(([n])=>n));
  for(let attempt=0;attempt<8;attempt++){
   const gi=(index*37+a.trip*83+attempt*59)%nav.goals.length,goal=nav.goals[gi],start=nav.points[a.node],end=nav.points[goal];
   if(blocked.has(goal)||Math.hypot(end[0]-start[0],end[1]-start[1])<9)continue;
   const path=findPath(nav,a.node,goal,blocked);if(path?.length){a.goal=goal;a.path=path;return true;}
  }a.trip++;return false;
 }
 function advance(a,dt){
  let remaining=dt;
  while(remaining>1e-8){
   if(a.mode==='turning'){
    const use=Math.min(remaining,a.turnDuration-a.progress);a.progress+=use;remaining-=use;const t=Math.min(1,a.progress/a.turnDuration),k=t*t*(3-2*t);a.yaw=a.turnFrom+a.turnDelta*k;
    if(t>=1){a.yaw=a.targetYaw;a.mode='moving';a.progress=0;}else break;
   }else if(a.mode==='moving'){
    const [ax,az]=nav.points[a.node],[bx,bz]=nav.points[a.next],length=Math.hypot(bx-ax,bz-az),duration=length/a.speed,use=Math.min(remaining,duration-a.progress);a.progress+=use;remaining-=use;a.distance+=use*a.speed;const t=Math.min(1,a.progress/duration);a.x=ax+(bx-ax)*t;a.z=az+(bz-az)*t;
    if(t>=1){occupied.delete(a.node);a.node=a.next;a.next=null;a.path.shift();a.mode='waiting';a.progress=0;a.wait=0;if(a.node===a.goal){a.path=[];a.trip++;a.replanAt=clock+.6;}}else break;
   }else break;
  }
 }
 function step(dt){clock+=dt;for(const a of agents)advance(a,dt);
  // Rotate priority between ticks; blocked vehicles accumulate waiting credit.
  const order=agents.map((a,i)=>[a,i]).sort(([a,i],[b,j])=>b.wait-a.wait||((i+turn)%agents.length)-((j+turn)%agents.length));turn++;
  for(const [a,index]of order){if(a.mode!=='waiting')continue;a.wait+=dt;if(clock<a.replanAt)continue;
   if(!a.path.length||occupied.has(a.path[0])){
    if(!plan(a,index)){a.replanAt=clock+.5;continue;}
   }
   const next=a.path[0];if(next===undefined||occupied.has(next))continue;
   occupied.set(next,a.id);a.next=next;const [x,z]=nav.points[next],yaw=Math.atan2(x-a.x,z-a.z),delta=angleDelta(yaw,a.yaw);a.targetYaw=a.yaw+delta;a.turnFrom=a.yaw;a.turnDelta=delta;a.progress=0;
   a.turnDuration=Math.max(.08,Math.abs(delta)/a.turnRate);a.mode=Math.abs(delta)>.001?'turning':'moving';
  }
 }
 function update(dt){accumulator+=dt;while(accumulator>=.05-1e-9){step(.05);accumulator-=.05;}}
 // A preview interpolates within the fixed navigation tick without advancing
 // reservations or introducing a second owner for the scene transform.
 function pose(a){
  if(a.mode==='moving'&&a.next!==null){const [x,z]=nav.points[a.node],[tx,tz]=nav.points[a.next],length=Math.hypot(tx-x,tz-z),t=Math.min(1,(a.progress+accumulator)*a.speed/length);return{x:x+(tx-x)*t,z:z+(tz-z)*t,yaw:a.yaw,distance:a.distance+accumulator*a.speed};}
  if(a.mode==='turning'){const t=Math.min(1,(a.progress+accumulator)/a.turnDuration),k=t*t*(3-2*t);return{x:a.x,z:a.z,yaw:a.turnFrom+a.turnDelta*k,distance:a.distance};}
  return a;
 }
 return{agents,byId,occupied,update,pose,get time(){return clock+accumulator;}};
}
