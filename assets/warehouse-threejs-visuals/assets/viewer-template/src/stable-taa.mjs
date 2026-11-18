import { TAARenderPass } from "three/addons/postprocessing/TAARenderPass.js";

export class StableTAARenderPass extends TAARenderPass {
  constructor(scene, camera) {
    super(scene, camera);
    this.sampleLevel = 0;
    this.unbiased = false;
    this.size = [0, 0];
  }
  invalidate() { this.accumulateIndex = -1; }
  setSize(width, height) {
    if (this.size[0] === width && this.size[1] === height) return;
    super.setSize(width, height);
    // r180 inherits SSAA resizing, which does not resize TAA's held frame.
    this._holdRenderTarget?.dispose();
    this._holdRenderTarget = null;
    this.size = [width, height];
    this.invalidate();
  }
  get complete() { return this.accumulate && this.accumulateIndex >= 32; }
}
