import * as THREE from 'three';
import {AssetLibrary} from './AssetLibrary.js';

// One mixer per placed instance; cached GLB geometry and clips remain immutable.
export class AnimatedAssetLibrary extends AssetLibrary {
 async instantiate(id,options={}) {
  const instance=await super.instantiate(id,options),{gltf}=await this.source(id);
  const mixer=new THREE.AnimationMixer(instance.object),clips=new Map(gltf.animations.map(c=>[c.name,c]));let active=null;
  const stop=()=>{mixer.stopAllAction();active=null;return instance;};
  instance.animation={
   clips:[...clips.keys()],
   play(name=clips.keys().next().value,{speed=1}={}){
    const clip=clips.get(name);if(!clip)throw Error('Unknown animation: '+name);
    if(!Number.isFinite(speed)||speed<=0)throw RangeError('Animation speed must be positive');
    stop();mixer.timeScale=speed;active=mixer.clipAction(clip).reset().setLoop(THREE.LoopRepeat,Infinity).play();mixer.update(0);return instance;
   },
   pause(value=true){if(active)active.paused=value;return instance;},
   setSpeed(value){if(!Number.isFinite(value)||value<=0)throw RangeError('Animation speed must be positive');mixer.timeScale=value;return instance;},
   stop,
   update(deltaSeconds){if(!Number.isFinite(deltaSeconds)||deltaSeconds<0)throw RangeError('Delta must be nonnegative');if(active)mixer.update(Math.min(deltaSeconds,.1));},
  };
  // Explicitly hand transform ownership back to direct joint control.
  const setJoint=instance.setJoint.bind(instance);instance.setJoint=(...args)=>{if(active)stop();return setJoint(...args);};
  const release=instance.release.bind(instance);instance.release=()=>{if(instance.carried.size)throw Error('Release cargo before releasing its carrier');stop();mixer.uncacheRoot(instance.object);release();};
  return instance;
 }
 update(deltaSeconds){for(const instance of this.instances)instance.animation.update(deltaSeconds);}
}
