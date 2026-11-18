import * as THREE from "three";

export function batchRepeatedGeometry(model) {
  model.updateMatrixWorld(true);
  const originalBounds = new THREE.Box3().setFromObject(model);
  const groups = new Map(), inverse = model.matrixWorld.clone().invert();
  model.traverse(object => {
    if (!object.isMesh || object.isSkinnedMesh || object.isInstancedMesh || object.children.length
      || Array.isArray(object.material) || object.morphTargetInfluences?.length || object.material.transparent
      || object.matrixWorld.determinant() < 0) return;
    for (let p = object; p; p = p.parent) if (!p.visible) return;
    const key = `${object.geometry.uuid}:${object.material.uuid}:${object.castShadow}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(object);
  });
  let batchedObjects = 0, batches = 0, maxTransformDeviation = 0;
  const matrix = new THREE.Matrix4();
  for (const group of groups.values()) {
    if (group.length < 3) continue;
    const mesh = new THREE.InstancedMesh(group[0].geometry, group[0].material, group.length);
    mesh.name = group[0].name; mesh.castShadow = group[0].castShadow; mesh.receiveShadow = true;
    mesh.userData.instanceNames = group.map(object => object.name);
    mesh.userData.instanceMetadata = group.map(object => structuredClone(object.userData));
    group.forEach((object, index) => {
      mesh.setMatrixAt(index, inverse.clone().multiply(object.matrixWorld));
      mesh.getMatrixAt(index, matrix); matrix.premultiply(model.matrixWorld);
      maxTransformDeviation = Math.max(maxTransformDeviation, ...matrix.elements.map((v, i) => Math.abs(v - object.matrixWorld.elements[i])));
    });
    if (maxTransformDeviation > .0001) throw new Error("Instance transform verification failed");
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    group.forEach(object => object.removeFromParent());
    model.add(mesh); batchedObjects += group.length; batches++;
  }
  model.updateMatrixWorld(true);
  const afterBounds = new THREE.Box3().setFromObject(model);
  const boundsDeviation = Math.max(originalBounds.min.distanceTo(afterBounds.min), originalBounds.max.distanceTo(afterBounds.max));
  if (boundsDeviation > .0003) throw new Error("Scene bounds changed during instancing");
  return { batchedObjects, batches, boundsDeviation, maxTransformDeviation };
}
