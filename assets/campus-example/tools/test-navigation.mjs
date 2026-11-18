import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createFleet,angleDelta,findPath} from '../dist/navigation.js';
const layout=JSON.parse(await fs.readFile(new URL('../dist/data/layout.json',import.meta.url))),nav=layout.navigation,fleet=createFleet(nav,layout.placements);
assert.ok(Math.abs(angleDelta(-Math.PI+.1,Math.PI-.1)-.2)<1e-9);
assert.ok(nav.points.length>500);assert.equal(fleet.agents.length,114);
let nearest=Infinity,turns=0,maxTurnDisplacement=0,maxYawJump=0;
for(let frame=0;frame<3600;frame++){
 const old=fleet.agents.map(a=>({x:a.x,z:a.z,yaw:a.yaw,mode:a.mode}));fleet.update(.05);
 for(let i=0;i<fleet.agents.length;i++){
  const a=fleet.agents[i],o=old[i];assert.ok([a.x,a.z,a.yaw].every(Number.isFinite));
  assert.equal(fleet.occupied.get(a.node),a.id);if(a.next!==null)assert.equal(fleet.occupied.get(a.next),a.id);
  if(a.mode==='turning'&&o.mode==='turning'){turns++;maxTurnDisplacement=Math.max(maxTurnDisplacement,Math.hypot(a.x-o.x,a.z-o.z));}
  maxYawJump=Math.max(maxYawJump,Math.abs(angleDelta(a.yaw,o.yaw)));
  for(let j=0;j<i;j++)nearest=Math.min(nearest,Math.hypot(a.x-fleet.agents[j].x,a.z-fleet.agents[j].z));
 }
}
assert.equal(maxTurnDisplacement,0,'Stop before turning; do not slide sideways');assert.ok(maxYawJump<.2,'No snapped headings');assert.ok(nearest>1.02,'Bodies remain separated');
const travelled=fleet.agents.map(a=>a.distance);assert.ok(Math.min(...travelled)>20,'Every vehicle must follow meaningful routes');
const slow=createFleet(nav,layout.placements),fast=createFleet(nav,layout.placements);for(let i=0;i<600;i++)slow.update(1/60);for(let i=0;i<300;i++)fast.update(1/30);for(let i=0;i<114;i++){const a=slow.pose(slow.agents[i]),b=fast.pose(fast.agents[i]);assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<1e-7);assert.ok(Math.abs(angleDelta(a.yaw,b.yaw))<1e-7);}
const paused=JSON.stringify(slow.agents);slow.update(0);assert.equal(JSON.stringify(slow.agents),paused);
const report={simulatedSeconds:180,vehicles:114,minimumCentreSeparationM:nearest,minimumTravelM:Math.min(...travelled),maximumTravelM:Math.max(...travelled),goalSelectionsAndReplans:fleet.agents.reduce((s,a)=>s+a.trip,0),turnSamples:turns,turnTranslationM:maxTurnDisplacement,maxYawPer50ms:maxYawJump,frameRateEquivalence:'30 and 60 FPS identical at 10 s',pause:'zero delta preserves state'};
await fs.writeFile(new URL('../navigation-validation.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
