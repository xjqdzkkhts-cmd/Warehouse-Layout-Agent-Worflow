import { NoBlending } from "three";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";

export class WarehouseAOPass extends GTAOPass {
  constructor(scene, camera) {
    super(scene, camera, 512, 512);
    this.dirty = true;
    this.cameraStamp = "";
    this.computations = 0;
    this.cacheHits = 0;
  }
  invalidate() { this.dirty = true; }
  dispose() {
    super.dispose();
    this.blendMaterial.dispose();
  }
  setSize(width, height) {
    if (this.width === width && this.height === height) return;
    super.setSize(width, height);
    this.invalidate();
  }
  _overrideVisibility() {
    super._overrideVisibility();
    this.scene.traverseVisible(object => {
      if (!object.isMesh) return;
      const materials = [].concat(object.material);
      const excluded = object.isReflector || materials.every(m => m.userData.luminous || m.transparent && !m.alphaTest);
      if (excluded) {
        object.visible = false;
        this._visibilityCache.push(object);
      }
    });
  }
  render(renderer, writeBuffer, readBuffer) {
    const stamp = [...this.camera.matrixWorld.elements, ...this.camera.projectionMatrix.elements].join(",");
    if (this.dirty || stamp !== this.cameraStamp || this.output !== GTAOPass.OUTPUT.Default) {
      super.render(renderer, writeBuffer, readBuffer);
      this.dirty = false; this.cameraStamp = stamp; this.computations++;
      return;
    }
    // During static TAA accumulation the scene and AO camera are unchanged.
    this.copyMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this.copyMaterial.blending = NoBlending;
    const target = this.renderToScreen ? null : writeBuffer;
    this._renderPass(renderer, this.copyMaterial, target);
    this.blendMaterial.uniforms.intensity.value = this.blendIntensity;
    this.blendMaterial.uniforms.tDiffuse.value = this.pdRenderTarget.texture;
    this._renderPass(renderer, this.blendMaterial, target);
    this.cacheHits++;
  }
}
