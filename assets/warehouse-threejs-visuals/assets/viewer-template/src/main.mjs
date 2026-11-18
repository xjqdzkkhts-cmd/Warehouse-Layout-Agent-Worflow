import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { attachSurface, installSoftShadows, loadSurfaces, loadWarehouseHDR, surfaceEnabled, proceduralUniforms } from "./surfaces.mjs";
import { concreteGLSL, concreteUniforms, configureConcrete } from "./concrete.mjs";
import { warehouseLayout } from "./warehouse-layout.mjs";
import { createWarehouse } from "./building.mjs";
import { validateProject, lightingTemplates } from "./project.mjs";
import { resolveMaterial, applyProfile } from "./material-profiles.mjs";
import { createFixture } from "./fixtures.mjs";
import { createWearTexture } from "./wear-atlas.mjs";
import { StableTAARenderPass } from "./stable-taa.mjs";
import { batchRepeatedGeometry } from "./batching.mjs";
import { hideConfiguredFloorNodes } from "./source-visibility.mjs";
import { WarehouseAOPass } from "./warehouse-ao.mjs";
import { qualitySchema, qualityKeys, qualityPresets, qualitySnapshot, selectQuality, editQuality,
  qualityStorageKey, restoreQuality, serializeQuality, aoConfiguration } from "./quality-settings.mjs";
import { createIcons, Warehouse, Sparkles, Box, Scan, Download, SlidersHorizontal, Orbit, Footprints, RotateCcw } from "lucide";

createIcons({ icons: { Warehouse, Sparkles, Box, Scan, Download, SlidersHorizontal, Orbit, Footprints, RotateCcw } });
const $ = id => document.getElementById(id);
const viewport = document.querySelector(".viewport");
const sceneDefaults = {
  look: "realistic", lighting: "daylight", exposure: 1, environment: .8,
  roughness: .72, wear: 1, building: true, walls: true, roof: true, lamps: true, lampPower: 1,
};
const defaultQuality = innerWidth < 720 ? "medium" : "high";
let savedQuality;
try { savedQuality = localStorage.getItem(qualityStorageKey); } catch {}
const restoredQuality = restoreQuality(savedQuality, defaultQuality);
let customQuality = restoredQuality.custom, activeSettingsTab = "quality";
const state = { ...sceneDefaults, ...restoredQuality.state, nav: "orbit", view: "interior" };
const query = new URLSearchParams(location.search);
if (["low", "medium", "high"].includes(query.get("quality"))) Object.assign(state, selectQuality(state, query.get("quality")));
let renderer, scene, camera, composer, orbit, aoPass, fxaaPass, bloomPass, sun, fill, taaPass, project;
let model, reflector, info, box, surfaceLibrary, floorY = .25, ready = false, scheduled = false;
let frontSoftbox, rimSoftbox;
let building, layout, buildingStamp, sourceIdentity;
let aoStamp = "", aoPlan, renderSizeStamp = "";
const framingPoints = [];
let frames = 0, lastFrameMs = 0, photoMaterials = [], selectedPointer, yaw = 0, pitch = 0;
let interacting = false, settleTimer, appliedLighting;
const keys = new Set();
const detailUniform = surfaceEnabled;
const errors = [];
const pointer = { dragging: false, x: 0, y: 0 };
const navButtons = [...document.querySelectorAll("[data-nav]")];
const effectButtons = [...document.querySelectorAll("[data-look]")];
const qualityButtons = [...document.querySelectorAll("[data-quality]")];
const rgba = new THREE.Color();
const movement = new THREE.Vector3();
const settingsToggle = $("settings-toggle");

function fail(error) {
  errors.push(String(error?.stack || error));
  $("error").textContent = `场景加载失败：${error?.message || error}`;
  $("error").hidden = false;
  $("loading").hidden = true;
  $("model-state").textContent = "加载失败";
  console.error(error);
}
function requestRender(invalidate = true) {
  if (invalidate && taaPass) taaPass.invalidate();
  if (invalidate && aoPass) aoPass.invalidate();
  if (scheduled || !renderer) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; draw(); });
}
function draw() {
  if (!renderer || !composer) return;
  const started = performance.now();
  renderer.info.reset();
  composer.render();
  frames++;
  lastFrameMs = performance.now() - started;
  if (ready && taaPass.accumulate && !taaPass.complete) requestRender(false);
}
function updateAntialias() {
  if (!taaPass) return;
  taaPass.accumulate = ready && state.antialias && !interacting;
  fxaaPass.enabled = !taaPass.accumulate;
}
function updateAO() {
  if (!aoPass) return;
  aoPlan = aoConfiguration(state, interacting, renderer.domElement.width, renderer.domElement.height);
  // EffectComposer resizes every pass to full size; reapply the AO budget independently.
  aoPass.setSize(aoPlan.width, aoPlan.height);
  const stamp = JSON.stringify(aoPlan);
  if (stamp !== aoStamp) {
    aoPass.updateGtaoMaterial({ radius: aoPlan.radius, thickness: aoPlan.thickness,
      samples: aoPlan.samples, distanceFallOff: 1.1, screenSpaceRadius: false });
    aoPass.updatePdMaterial({ samples: aoPlan.denoise, radius: aoPlan.denoiseRadius,
      depthPhi: .3, normalPhi: 8, lumaPhi: 8 });
    aoPass.invalidate(); aoStamp = stamp;
  }
  aoPass.enabled = aoPlan.enabled;
  aoPass.blendIntensity = aoPlan.intensity;
}
function fitSunShadow() {
  if (!building) return;
  sun.updateMatrixWorld(true); sun.target.updateMatrixWorld(true);
  sun.shadow.updateMatrices(sun);
  const b = box.clone().union(building.bounds);
  const lightBox = new THREE.Box3();
  for (let i = 0; i < 8; i++) lightBox.expandByPoint(new THREE.Vector3(
    i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y,
    i & 4 ? b.max.z : b.min.z).applyMatrix4(sun.shadow.camera.matrixWorldInverse));
  const c = sun.shadow.camera;
  c.left = lightBox.min.x - .7; c.right = lightBox.max.x + .7;
  c.bottom = lightBox.min.y - .7; c.top = lightBox.max.y + .7;
  c.near = Math.max(.1, -lightBox.max.z - 2); c.far = -lightBox.min.z + 2;
  c.updateProjectionMatrix();
  renderer.shadowMap.needsUpdate = true;
}
function updateLights() {
  if (!sun || !box) return;
  const center = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() * .6;
  const config = lightingTemplates[state.lighting];
  if (appliedLighting !== state.lighting) {
    sun.position.copy(center).addScaledVector(new THREE.Vector3(...config.direction).normalize(), radius * 2.4);
    sun.target.position.copy(center);
    sun.color.setHex(config.color);
    appliedLighting = state.lighting;
    fitSunShadow();
    renderer.shadowMap.needsUpdate = true;
  }
  const enclosed = state.building && state.roof;
  sun.intensity = config.power * (enclosed && !layout.daylightOpenings ? .15 : 1);
  fill.intensity = config.fill * (enclosed ? .55 : 1);
  if (frontSoftbox) {
    frontSoftbox.intensity = enclosed ? 0 : config.area;
    rimSoftbox.intensity = enclosed ? 0 : config.area * .5;
  }
  renderer.toneMappingExposure = state.exposure;
  scene.environmentIntensity = state.environment * (enclosed ? config.environment : 1);
  scene.environmentRotation.y = -.6;
  if (renderer.shadowMap.enabled !== state.shadows) {
    renderer.shadowMap.enabled = state.shadows; renderer.shadowMap.needsUpdate = true;
  }
}
function updateQuality() {
  if (!composer) return;
  const width = Math.max(1, viewport.clientWidth), height = Math.max(1, viewport.clientHeight);
  const ratio = Math.min(devicePixelRatio || 1, state.pixelRatio);
  const sizeStamp = `${width}:${height}:${ratio}`;
  if (sizeStamp !== renderSizeStamp) {
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(ratio);
    composer.setSize(width, height);
    renderSizeStamp = sizeStamp;
  }
  updateAO();
  bloomPass.enabled = state.bloom && state.look === "realistic" && !interacting;
  bloomPass.strength = state.bloomStrength;
  fxaaPass.material.uniforms.resolution.value.set(1 / (width * ratio), 1 / (height * ratio));
  const shadowSize = state.shadowResolution;
  if (sun.shadow.mapSize.x !== shadowSize) {
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
  if (reflector) {
    const scale = { low: .25, medium: .5, high: .8 }[state.reflectionQuality];
    const rw = Math.max(64, Math.round(width * ratio * scale));
    const rh = Math.max(64, Math.round(height * ratio * scale));
    reflector.getRenderTarget().setSize(rw, rh);
    reflector.material.uniforms.uTexel.value.set(1 / rw, 1 / rh);
  }
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  updateAntialias();
  updateBuilding();
  renderer.shadowMap.needsUpdate = true;
  qualityButtons.forEach(button => {
    const active = button.dataset.quality === state.quality;
    button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active));
  });
  requestRender();
}

function prepareMaterials() {
  const unique = new Set();
  const upgrades = new Map();
  model.traverse(object => {
    if (!object.isMesh) return;
    const upgrade = original => {
      if (!original.isMeshStandardMaterial || original.isMeshPhysicalMaterial) return original;
      if (!upgrades.has(original)) {
        const physical = new THREE.MeshPhysicalMaterial();
        THREE.MeshStandardMaterial.prototype.copy.call(physical, original);
        physical.defines = { STANDARD: "", PHYSICAL: "" };
        upgrades.set(original, physical);
      }
      return upgrades.get(original);
    };
    object.material = Array.isArray(object.material) ? object.material.map(upgrade) : upgrade(object.material);
    (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => unique.add(material));
    object.castShadow = true; object.receiveShadow = true;
    const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
    if (Math.max(size.x, size.y, size.z) < .10) object.castShadow = false;
  });
  photoMaterials = [...unique].filter(material => material.isMeshStandardMaterial);
  photoMaterials.forEach(material => {
    const resolved = resolveMaterial(material, project.materialBindings);
    const { kind } = resolved;
    material.userData.preview = {
      ...resolved, original: { color: material.color.clone(), roughness: material.roughness, metalness: material.metalness,
        clearcoat: material.clearcoat, clearcoatRoughness: material.clearcoatRoughness,
        specularIntensity: material.specularIntensity, specularColor: material.specularColor?.clone() },
    };
    attachSurface(material, kind, surfaceLibrary);
  });
  info.pbr = { maps: Object.values(surfaceLibrary).reduce((sum, maps) => sum + Object.keys(maps).length, 0),
    materials: photoMaterials.filter(m => m.userData.preview.kind !== "other").length,
    classifications: photoMaterials.map(m => ({ name: m.name, kind: m.userData.preview.kind,
      role: m.userData.preview.role, source: m.userData.preview.source })) };
}
function applyMaterials() {
  const photo = state.look === "realistic";
  concreteUniforms.uWearStrength.value = state.wear;
  concreteUniforms.uConcreteRoughness.value = state.roughness;
  detailUniform.value = photo && state.detail ? 1 : 0;
  proceduralUniforms.uProceduralEnabled.value = photo && state.detail && state.microDetail ? 1 : 0;
  proceduralUniforms.uProceduralStrength.value = state.microStrength;
  for (const material of photoMaterials) {
    const { kind, role, original } = material.userData.preview;
    material.color.copy(original.color); material.roughness = original.roughness; material.metalness = original.metalness;
    if (material.isMeshPhysicalMaterial) {
      material.clearcoat = original.clearcoat;
      material.clearcoatRoughness = original.clearcoatRoughness;
      material.specularIntensity = original.specularIntensity;
      material.specularColor.copy(original.specularColor);
    }
    if (!photo) continue;
    applyProfile(material, role);
    if (role && project.materialColors?.[material.name]) material.color.fromArray(project.materialColors[material.name]);
    if (kind === "floor") material.roughness = state.roughness;
  }
  if (reflector) {
    reflector.visible = photo && state.reflections && state.reflection > 0 && !interacting;
    reflector.material.uniforms.uStrength.value = state.reflection;
    reflector.material.uniforms.uRoughness.value = state.roughness;
  }
  updateAO();
  bloomPass.enabled = photo && state.bloom && !interacting;
  bloomPass.strength = state.bloomStrength;
  updateAntialias();
  effectButtons.forEach(button => {
    const active = button.dataset.look === state.look;
    button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active));
  });
  requestRender();
}
function setInteracting(active) {
  clearTimeout(settleTimer);
  const apply = () => {
    interacting = active;
    const photo = state.look === "realistic";
    detailUniform.value = photo && state.detail ? 1 : 0;
    if (reflector) reflector.visible = photo && state.reflections && state.reflection > 0 && !active;
    updateAO();
    if (bloomPass) bloomPass.enabled = photo && state.bloom && !active;
    updateAntialias();
    requestRender();
  };
  if (active) apply(); else settleTimer = setTimeout(apply, 150);
}
function makeFloorReflection() {
  floorY = layout.floorY;
  const sizeX = layout.width + .5, sizeZ = layout.length + .5;
  const shader = {
    name: "warehouse-floor-reflection",
    uniforms: { ...concreteUniforms, color: { value: new THREE.Color() }, tDiffuse: { value: null }, textureMatrix: { value: new THREE.Matrix4() },
      uStrength: { value: state.reflection }, uRoughness: { value: state.roughness },
      uNormal: { value: surfaceLibrary.floor.normal }, uArm: { value: surfaceLibrary.floor.arm },
      uDetail: detailUniform, uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) } },
    vertexShader: `
      uniform mat4 textureMatrix; varying vec4 vProjective; varying vec3 vReflectionWorld;
      void main() { vProjective=textureMatrix*vec4(position,1.0); vReflectionWorld=(modelMatrix*vec4(position,1.0)).xyz;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse,uNormal,uArm; uniform float uStrength,uRoughness,uDetail; uniform vec2 uTexel;
      varying vec4 vProjective; varying vec3 vReflectionWorld;
      ${concreteGLSL}
      void main() {
        vec2 uv=vProjective.xy/vProjective.w;
        vec2 floorUv=vec2(vReflectionWorld.x,-vReflectionWorld.z)/3.0;
        float microRough=texture2D(uArm,floorUv).g;
        vec3 wear=concreteWear(vReflectionWorld);
        float polish=concretePolish(wear)*uDetail;
        float localRough=concreteRoughness(wear,microRough);
        vec2 ripple=(texture2D(uNormal,floorUv).xy*2.0-1.0)*.0015*uDetail*(1.0-polish*.85);
        uv+=ripple;
        float radius=mix(25.0,1.2,polish)+localRough*5.0; vec2 d=uTexel*radius;
        vec3 c=texture2D(tDiffuse,uv).rgb*.28;
        c+=(texture2D(tDiffuse,uv+vec2(d.x,0)).rgb+texture2D(tDiffuse,uv-vec2(d.x,0)).rgb)*.12;
        c+=(texture2D(tDiffuse,uv+vec2(0,d.y)).rgb+texture2D(tDiffuse,uv-vec2(0,d.y)).rgb)*.12;
        c+=(texture2D(tDiffuse,uv+d).rgb+texture2D(tDiffuse,uv-d).rgb+texture2D(tDiffuse,uv+vec2(d.x,-d.y)).rgb+texture2D(tDiffuse,uv+vec2(-d.x,d.y)).rgb)*.06;
        float ndv=abs(normalize(cameraPosition-vReflectionWorld).y);
        float fresnel=.04+.96*pow(1.0-ndv,5.0);
        float alpha=uStrength*(mix(.012,.18,polish)+fresnel*mix(.12,.76,polish))*(1.0-localRough*.3);
        gl_FragColor=vec4(c,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  };
  reflector = new Reflector(new THREE.PlaneGeometry(sizeX, sizeZ), {
    textureWidth: 512, textureHeight: 512, clipBias: .001, multisample: 0, shader,
  });
  reflector.rotation.x = -Math.PI / 2;
  reflector.position.set(layout.centerX, floorY + .0015, layout.centerZ);
  reflector.material.transparent = true;
  reflector.material.depthWrite = false;
  reflector.renderOrder = 3;
  const reflectionRender = reflector.onBeforeRender;
  reflector.onBeforeRender = function (r, s, c, ...rest) {
    if (s.overrideMaterial) return;
    reflectionRender.call(this, r, s, c, ...rest);
  };
  scene.add(reflector);
}
function makeLightingRig() {
  RectAreaLightUniformsLib.init();
  const center = box.getCenter(new THREE.Vector3());
  frontSoftbox = new THREE.RectAreaLight(0xeaf3ff, 2.8, layout.length * .65, layout.height * .55);
  frontSoftbox.position.set(layout.maxX + layout.width * .2, floorY + layout.height * .8, center.z);
  frontSoftbox.lookAt(center.x, floorY + layout.height * .3, center.z);
  rimSoftbox = new THREE.RectAreaLight(0xfff4e5, 1.4, layout.length * .55, layout.height * .45);
  rimSoftbox.position.set(layout.minX - layout.width * .16, layout.eave, center.z - layout.length * .23);
  rimSoftbox.lookAt(center.x, floorY + layout.height * .4, center.z);
  scene.add(frontSoftbox, rimSoftbox);
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(layout.length * 10, layout.length * 10), building.floor.material);
  backdrop.rotation.x = -Math.PI / 2;
  backdrop.position.set(center.x, box.min.y - .005, center.z);
  backdrop.receiveShadow = true; backdrop.name = "preview-studio-ground";
  scene.add(backdrop);
  info.environment = "Poly Haven / Empty Warehouse 01, 2K HDR";
}
function setView(name) {
  if (!box) return;
  state.view = name; $("view").value = name;
  const preset = project.cameras[name];
  camera.fov = preset?.fov ?? (name === "interior" ? 55 : 43); camera.updateProjectionMatrix();
  if (preset) {
    camera.position.fromArray(preset.position); orbit.target.fromArray(preset.target);
    camera.lookAt(orbit.target); orbit.update(); requestRender(); return;
  }
  if (["interior", "floor", "workcell", "conveyor"].includes(name)) {
    // A project-specified camera takes priority; this fallback only uses the envelope.
    camera.position.set(layout.maxX - 1.2, floorY + (name === "floor" ? 1.1 : 2.6), layout.maxZ - 1.8);
    orbit.target.set(layout.centerX, floorY + layout.height * .24, layout.centerZ);
    camera.lookAt(orbit.target); orbit.update(); requestRender(); return;
  }
  const viewBounds = building && state.building ? box.clone().union(building.bounds) : box;
  const size = viewBounds.getSize(new THREE.Vector3()), center = viewBounds.getCenter(new THREE.Vector3());
  center.y = viewBounds.min.y + size.y * .42;
  const viewPoints = [...framingPoints];
  const shellBounds = state.building ? building.bounds : new THREE.Box3().setFromObject(building.floor);
  for (let i = 0; i < 8; i++) viewPoints.push(new THREE.Vector3(i & 1 ? shellBounds.max.x : shellBounds.min.x,
    i & 2 ? shellBounds.max.y : shellBounds.min.y, i & 4 ? shellBounds.max.z : shellBounds.min.z));
  const direction = {
    overview: new THREE.Vector3(1.2, .95, 1.35),
    exterior: new THREE.Vector3(1.2, .65, 1.35),
    opposite: new THREE.Vector3(-1.3, .8, -.9),
    detail: new THREE.Vector3(1, .4, 1.1),
    top: new THREE.Vector3(.001, 1, .001),
  }[name].normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  const forward = direction.clone().negate();
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanH = tanV * camera.aspect;
  let distance = 0;
  for (const point of viewPoints) {
    const corner = point.clone().sub(center);
    distance = Math.max(distance, Math.abs(corner.dot(right)) / tanH - corner.dot(forward),
      Math.abs(corner.dot(up)) / tanV - corner.dot(forward));
  }
  distance *= 1.02;
  if (name !== "detail") {
    // Frame the occupied geometry, not empty corners of the overall warehouse box.
    for (let iteration = 0; iteration < 5; iteration++) {
      camera.position.copy(center).addScaledVector(direction, distance);
      camera.lookAt(center); camera.updateMatrixWorld(true);
      let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
      for (const point of viewPoints) {
        const p = point.clone().project(camera);
        xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x);
        yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y);
      }
      center.addScaledVector(right, (xMin + xMax) * .5 * distance * tanH);
      center.addScaledVector(up, (yMin + yMax) * .5 * distance * tanV);
      if (iteration < 4) distance *= THREE.MathUtils.clamp(Math.max(xMax - xMin, yMax - yMin) / 1.8, .8, 1.2);
    }
  }
  camera.position.copy(center).addScaledVector(direction, name === "detail" ? distance * .63 : distance);
  orbit.target.copy(center);
  camera.lookAt(center); orbit.update(); requestRender();
}
function setNavigation(mode) {
  const previous = state.nav;
  state.nav = mode;
  keys.clear(); pointer.dragging = false; setInteracting(false);
  orbit.enabled = mode === "orbit";
  if (previous === "walk" && mode === "orbit") {
    orbit.target.copy(camera.position).addScaledVector(camera.getWorldDirection(new THREE.Vector3()), 8);
    orbit.update();
  }
  navButtons.forEach(button => {
    const active = button.dataset.nav === mode;
    button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active));
  });
  if (mode === "walk" && box) {
    const preset = project.cameras.walk;
    if (preset) {
      camera.position.fromArray(preset.position);
      camera.lookAt(new THREE.Vector3().fromArray(preset.target));
    } else {
      setView("interior"); camera.position.y = floorY + 1.7; camera.lookAt(orbit.target);
    }
    state.view = "interior"; $("view").value = "interior";
    const rotation = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    yaw = rotation.y; pitch = rotation.x;
  }
  requestRender();
}
function syncControls() {
  ["exposure", "environment", "roughness", "wear", "lampPower"].forEach(id => {
    $(id).value = state[id]; $(`${id}-value`).value = state[id].toFixed(2);
  });
  ["building", "walls", "roof", "lamps"].forEach(id => { $(id).checked = state[id]; });
  for (const id of qualityKeys) {
    const control = $(id);
    if (control.type === "checkbox") control.checked = state[id];
    else control.value = state[id];
    if ($(`${id}-value`)) $(`${id}-value`).value = Number(state[id]).toFixed(2);
  }
  qualityButtons.forEach(button => {
    const active = button.dataset.quality === state.quality;
    button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active));
  });
  ["walls", "roof"].forEach(id => { $(id).disabled = !state.building; });
  $("lamps").disabled = !state.building || !state.roof;
  $("lampPower").disabled = !state.building || !state.roof || !state.lamps;
  $("lighting").value = state.lighting;
}
function updateBuilding() {
  if (!building) return;
  building.update(state);
  const stamp = `${state.building}:${state.walls}:${state.roof}:${state.shadows}:${state.indoorShadows}`;
  if (stamp !== buildingStamp) {
    renderer.shadowMap.needsUpdate = true;
    buildingStamp = stamp;
  }
}
function updateSettings() { updateBuilding(); updateLights(); applyMaterials(); }
function persistGraphics() {
  try { localStorage.setItem(qualityStorageKey, serializeQuality(state, customQuality)); } catch {}
}
function applyGraphicsPreset(preset) {
  if (preset === "custom" && !customQuality) customQuality = qualitySnapshot(state);
  Object.assign(state, selectQuality(state, preset, customQuality));
  syncControls(); persistGraphics();
  if (composer) { updateQuality(); updateSettings(); }
}
function changeGraphics(key, value) {
  Object.assign(state, editQuality(state, key, value));
  customQuality = qualitySnapshot(state);
  syncControls(); persistGraphics();
  if (!composer) return;
  if (["pixelRatio", "shadowResolution", "reflectionQuality"].includes(key)) updateQuality();
  updateSettings();
}
function setSettingsTab(tab, focus = false) {
  if (!["quality", "scene"].includes(tab)) throw new Error("Unknown settings tab");
  activeSettingsTab = tab;
  for (const name of ["quality", "scene"]) {
    $(`${name}-pane`).hidden = name !== tab;
    $(`${name}-tab`).setAttribute("aria-selected", String(name === tab));
    $(`${name}-tab`).tabIndex = name === tab ? 0 : -1;
  }
  $("reset").setAttribute("aria-label", tab === "quality" ? "重置画质" : "重置场景");
  $("reset").dataset.tooltip = tab === "quality" ? "重置画质" : "重置场景";
  $("settings").scrollTop = 0;
  if (focus) $(`${tab}-tab`).focus();
}
for (const name of ["quality", "scene"]) {
  $(`${name}-tab`).addEventListener("click", () => setSettingsTab(name));
  $(`${name}-tab`).addEventListener("keydown", event => {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.code)) {
      event.preventDefault();
      setSettingsTab(event.code === "Home" ? "quality" : event.code === "End" ? "scene"
        : name === "quality" ? "scene" : "quality", true);
    }
  });
}
for (const key of qualityKeys) {
  const control = $(key), rule = qualitySchema[key];
  const event = control.type === "range" ? "input" : "change";
  if (control.type === "range") {
    control.addEventListener("pointerdown", () => setInteracting(true));
    for (const end of ["pointerup", "pointercancel"]) control.addEventListener(end, () => setInteracting(false));
  }
  control.addEventListener(event, () => changeGraphics(key, rule.type === "boolean" ? control.checked
    : typeof qualityPresets.high[key] === "number" ? Number(control.value) : control.value));
}
["exposure", "environment", "roughness", "wear", "lampPower"].forEach(id => {
  $(id).addEventListener("pointerdown", () => setInteracting(true));
  $(id).addEventListener("pointerup", () => setInteracting(false));
  $(id).addEventListener("pointercancel", () => setInteracting(false));
  $(id).addEventListener("input", () => {
    state[id] = Number($(id).value); $(`${id}-value`).value = state[id].toFixed(2); updateSettings();
  });
});
["building", "walls", "roof", "lamps"].forEach(id => {
  $(id).addEventListener("change", () => { state[id] = $(id).checked; syncControls(); updateSettings(); });
});
$("lighting").addEventListener("change", () => { state.lighting = $("lighting").value; updateSettings(); });
effectButtons.forEach(button => button.addEventListener("click", () => {
  state.look = button.dataset.look; applyMaterials();
}));
qualityButtons.forEach(button => button.addEventListener("click", () => {
  applyGraphicsPreset(button.dataset.quality);
}));
navButtons.forEach(button => button.addEventListener("click", () => setNavigation(button.dataset.nav)));
$("view").addEventListener("change", () => { setNavigation("orbit"); setView($("view").value); });
$("project-select").addEventListener("change", () => {
  const url = new URL(location.href); url.searchParams.set("project", $("project-select").value); location.href = url;
});
$("fit").addEventListener("click", () => { setNavigation("orbit"); setView("overview"); });
$("reset").addEventListener("click", () => {
  if (activeSettingsTab === "quality") applyGraphicsPreset(defaultQuality);
  else {
    Object.assign(state, sceneDefaults); syncControls(); updateSettings();
    setNavigation("orbit"); setView("interior");
  }
});
settingsToggle.addEventListener("click", () => {
  $("settings").classList.toggle("closed");
  settingsToggle.setAttribute("aria-expanded", String(!$("settings").classList.contains("closed")));
});
if (innerWidth < 720) {
  $("settings").classList.add("closed"); settingsToggle.setAttribute("aria-expanded", "false");
}
$("download").addEventListener("click", () => {
  if (!ready) return;
  const button = $("download"); button.disabled = true;
  finishFrame().then(() => {
    const link = document.createElement("a");
    link.download = `${project.id}-${state.look}.png`; link.href = renderer.domElement.toDataURL("image/png"); link.click();
  }).finally(() => { button.disabled = false; });
});
document.addEventListener("keydown", event => {
  if (state.nav !== "walk" || event.metaKey || event.ctrlKey || event.altKey
    || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
  if (["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ShiftLeft"].includes(event.code)) {
    event.preventDefault(); keys.add(event.code); startMovement();
  }
});
document.addEventListener("keyup", event => { keys.delete(event.code); if (!keys.size) setInteracting(false); });
window.addEventListener("blur", () => { keys.clear(); pointer.dragging = false; setInteracting(false); });
window.addEventListener("pointerup", () => { if (!keys.size) setInteracting(false); });
let movementFrame = null, movementTime = 0;
function startMovement() {
  if (movementFrame !== null) return;
  setInteracting(true);
  movementTime = performance.now();
  const tick = time => {
    movementFrame = null;
    if (state.nav !== "walk" || !keys.size) return;
    const dt = Math.min(.06, (time - movementTime) / 1000); movementTime = time;
    movement.set(Number(keys.has("KeyD")) - Number(keys.has("KeyA")), 0,
      Number(keys.has("KeyS")) - Number(keys.has("KeyW")));
    movement.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    movement.y = Number(keys.has("KeyE")) - Number(keys.has("KeyQ"));
    camera.position.addScaledVector(movement.normalize(), dt * (keys.has("ShiftLeft") ? 7 : 2.6));
    camera.position.y = Math.max(floorY + .4, camera.position.y);
    requestRender(); movementFrame = requestAnimationFrame(tick);
  };
  movementFrame = requestAnimationFrame(tick);
}
$("scene").addEventListener("pointerdown", event => {
  if (state.nav !== "walk") return;
  setInteracting(true);
  pointer.dragging = true; pointer.x = event.clientX; pointer.y = event.clientY;
  $("scene").setPointerCapture(event.pointerId);
});
$("scene").addEventListener("pointermove", event => {
  if (!pointer.dragging || state.nav !== "walk") return;
  yaw -= (event.clientX - pointer.x) * .004;
  pitch = THREE.MathUtils.clamp(pitch - (event.clientY - pointer.y) * .004, -1.4, 1.4);
  pointer.x = event.clientX; pointer.y = event.clientY;
  camera.rotation.set(pitch, yaw, 0, "YXZ"); requestRender();
});
$("scene").addEventListener("pointerup", () => { pointer.dragging = false; if (!keys.size) setInteracting(false); });
$("scene").addEventListener("pointercancel", () => { pointer.dragging = false; setInteracting(false); });

window.__WAREHOUSE_PREVIEW = {
  get ready() { return ready; }, get state() { return { ...state }; }, errors,
  get info() { return info; }, get frames() { return frames; },
  setLook(look) { state.look = look; applyMaterials(); },
  setOption(key, value) {
    if (key === "quality") return this.setQuality(value);
    if (Object.hasOwn(qualitySchema, key)) return changeGraphics(key, value);
    if (key === "lighting" && !lightingTemplates[value]) throw new Error("Unknown lighting template");
    if (Object.hasOwn(sceneDefaults, key)) { state[key] = value; syncControls(); updateSettings(); }
  },
  setQuality: applyGraphicsPreset,
  setSettingsTab,
  setView,
  setNavigation,
  setInteracting,
  setSettings(open) { $("settings").classList.toggle("closed", !open); settingsToggle.setAttribute("aria-expanded", String(open)); },
  verifyScene() {
    const names = [], materials = new Set(), sourceFloors = [];
    model.traverse(object => {
      names.push(object.name, ...(object.userData.instanceNames || []));
      if (object.material) for (const material of [].concat(object.material)) materials.add(material.name);
      if (object.isMesh && [].concat(object.material).some(material => material.userData.preview?.kind === "floor")) {
        const bounds = new THREE.Box3().setFromObject(object);
        let visible = true;
        for (let parent = object; parent; parent = parent.parent) visible &&= parent.visible;
        sourceFloors.push({ name: object.name, sourceName: object.userData.name ?? null,
          visible, minY: bounds.min.y, maxY: bounds.max.y });
      }
    });
    return {
      model: { sourceTriangles: info.renderTriangles, materialCount: materials.size,
        runtimeBatching: info.runtimeBatching, sourceNames: names.length },
      configuredFloors: (info.floorReplacement?.nodes ?? []).map(node => {
        const object = model.getObjectByName(node.runtimeName);
        return { ...node, found: Boolean(object), visible: object?.visible ?? null };
      }),
      building: building.diagnostics(),
      project: { id: project.id, synthetic: project.source.type === "fixture",
        envelopeSource: layout.envelopeSource, trafficLanes: project.traffic.length,
        unassignedMaterials: info.pbr.classifications.filter(m => m.source === "unassigned").map(m => m.name) },
      concrete: { atlasWidth: surfaceLibrary.floor.wear.image.width, atlasHeight: surfaceLibrary.floor.wear.image.height,
        bounds: concreteUniforms.uFloorBounds.value.toArray(), wearStrength: concreteUniforms.uWearStrength.value,
        surfaceY: floorY, sourceFloors, replacement: info.floorReplacement ?? null },
      graphics: { preset: state.quality, settings: qualitySnapshot(state), tab: activeSettingsTab,
        effective: { pixelRatio: renderer.getPixelRatio(), shadowResolution: sun.shadow.mapSize.x,
          reflections: reflector.visible, reflectionWidth: reflector.getRenderTarget().width,
          bloom: bloomPass.enabled, bloomStrength: bloomPass.strength } },
      ao: { ...aoPlan, renderWidth: aoPass.width, renderHeight: aoPass.height,
        computations: aoPass.computations, cacheHits: aoPass.cacheHits },
      procedural: { enabled: proceduralUniforms.uProceduralEnabled.value === 1,
        strength: proceduralUniforms.uProceduralStrength.value },
      pbrMaps: Object.values(surfaceLibrary).flatMap(maps => Object.values(maps)).map(texture => ({
        width: texture.image.width, height: texture.image.height, colorSpace: texture.colorSpace,
      })),
    };
  },
  capture() { draw(); return renderer.domElement.toDataURL("image/png"); },
  finishFrame,
  setCamera(position, target, fov = 43) {
    camera.position.fromArray(position); orbit.target.fromArray(target);
    camera.fov = fov; camera.updateProjectionMatrix(); camera.lookAt(orbit.target); orbit.update();
    requestRender();
  },
  cameraState() { return { position: camera.position.toArray(), target: orbit.target.toArray(), fov: camera.fov }; },
  floorLayersAt(x, z) {
    const candidates = [];
    scene.traverseVisible(object => {
      if (object === building.floor || object.isMesh && [].concat(object.material)
        .some(material => material.userData.preview?.kind === "floor")) candidates.push(object);
    });
    const ray = new THREE.Raycaster(new THREE.Vector3(x, floorY + .02, z), new THREE.Vector3(0, -1, 0), 0, .04);
    const hits = ray.intersectObjects(candidates, false);
    return [...new Map(hits.map(hit => [hit.object.uuid, { name: hit.object.name, y: hit.point.y }])).values()];
  },
  stats() { return { frames, renderMs: lastFrameMs, calls: renderer?.info.render.calls,
    triangles: renderer?.info.render.triangles, quality: state.quality, interacting, ready,
    aaSamples: Math.max(0, taaPass?.accumulateIndex ?? 0), aaComplete: taaPass?.complete, aaEnabled: taaPass?.accumulate,
    aoEnabled: aoPass?.enabled, aoSamples: aoPlan?.samples,
    aoComputations: aoPass?.computations, aoCacheHits: aoPass?.cacheHits }; },
  render: draw,
  pixelSummary() {
    draw(); const gl = renderer.getContext(), w = renderer.domElement.width, h = renderer.domElement.height;
    const data = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);
    let sum = 0, varied = 0; const base = data[0] + data[1] + data[2];
    for (let i = 0; i < data.length; i += 4) { const value = data[i] + data[i + 1] + data[i + 2];
      sum += value; if (Math.abs(value - base) > 20) varied++; }
    return { width: w, height: h, mean: sum / (w * h * 3), variedFraction: varied / (w * h) };
  },
};

async function finishFrame() {
  if (!ready) return;
  setInteracting(false);
  await new Promise(resolve => setTimeout(resolve, 200));
  requestRender();
  for (let i = 0; i < 600; i++) {
    if (!taaPass.accumulate || taaPass.complete) { draw(); return; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("Static accumulation did not finish");
}
async function init() {
  const catalogResponse = await fetch("./projects/catalog.json");
  if (!catalogResponse.ok) throw new Error("Project catalog was not found");
  const catalog = await catalogResponse.json();
  if (!Array.isArray(catalog) || !catalog.length || catalog.some(p =>
    !/^[a-z0-9-]+$/.test(p.id) || typeof p.title !== "string")) throw new Error("Invalid project catalog");
  for (const item of catalog) $("project-select").add(new Option(item.title, item.id));
  const projectId = query.get("project") || catalog[0].id;
  if (!/^[a-z0-9-]+$/.test(projectId)) throw new Error("Invalid project identifier");
  const response = await fetch(`./projects/${projectId}.json`);
  if (!response.ok) throw new Error("Project configuration was not found");
  project = validateProject(await response.json());
  sceneDefaults.lighting = state.lighting = project.lighting.template;
  if (![...$("project-select").options].some(option => option.value === projectId)) {
    $("project-select").add(new Option(project.title, projectId));
  }
  $("project-select").value = projectId;
  document.title = project.title;
  for (const option of [...$("view").options]) {
    if (["workcell", "conveyor"].includes(option.value) && !project.cameras[option.value]) option.remove();
  }
  renderer = new THREE.WebGLRenderer({ canvas: $("scene"), antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; renderer.info.autoReset = false;
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    const message = `${gl.getShaderInfoLog(vertex)} ${gl.getShaderInfoLog(fragment)} ${gl.getProgramInfoLog(program)}`;
    errors.push(message); console.error(message);
  };
  scene = new THREE.Scene(); scene.background = new THREE.Color(0xd4dde1);
  camera = new THREE.PerspectiveCamera(43, 1, .12, 400);
  orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = false; orbit.minDistance = .6; orbit.maxDistance = 180;
  orbit.maxPolarAngle = Math.PI * .49; orbit.addEventListener("change", requestRender);
  orbit.addEventListener("start", () => setInteracting(true));
  orbit.addEventListener("end", () => setInteracting(false));
  const surfacePromise = loadSurfaces(renderer);
  const hdrPromise = loadWarehouseHDR(renderer);
  fill = new THREE.HemisphereLight(0xeaf3ff, 0xa2a4a0, .34); scene.add(fill);
  sun = new THREE.DirectionalLight(0xfff2e0, 2.5); sun.castShadow = true;
  sun.shadow.bias = -.000025; sun.shadow.normalBias = .016;
  scene.add(sun, sun.target);
  composer = new EffectComposer(renderer);
  taaPass = new StableTAARenderPass(scene, camera); composer.addPass(taaPass);
  aoPass = new WarehouseAOPass(scene, camera);
  composer.addPass(aoPass);
  bloomPass = new UnrealBloomPass(new THREE.Vector2(512, 512), .16, .35, 1.8);
  composer.addPass(bloomPass); composer.addPass(new OutputPass());
  fxaaPass = new ShaderPass(FXAAShader); composer.addPass(fxaaPass);
  new ResizeObserver(updateQuality).observe(viewport);
  syncControls(); updateQuality();
  $("download").disabled = $("fit").disabled = true;
  if (project.source.type === "fixture") {
    const fixture = createFixture(project.source);
    model = fixture.model;
    info = { synthetic: true, equipmentCount: fixture.equipmentCount, after: { bytes: 0 } };
  } else {
  info = { after: { bytes: 0 } };
  if (project.source.infoUrl) {
    const infoResponse = await fetch(project.source.infoUrl);
    if (!infoResponse.ok) throw new Error("Model record was not found");
    info = { ...info, ...await infoResponse.json() };
  }
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().load(project.source.url, resolve, event => {
    if (event.total) info.after.bytes = event.total;
    if (event.total) {
      const percent = Math.round(event.loaded / event.total * 100);
      $("load-progress").value = percent; $("load-value").textContent = `${percent}%`;
      if (percent === 100) { $("load-title").textContent = "准备材质"; $("load-value").textContent = ""; }
    }
  }, reject));
  model = gltf.scene;
  sourceIdentity = { associations: gltf.parser.associations, nodes: gltf.parser.json.nodes };
  }
  model.name = "warehouse-source";
  scene.add(model); model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  layout = warehouseLayout({ min: box.min.toArray(), max: box.max.toArray() }, project.floorY, project.building, project.lighting);
  floorY = project.floorY;
  const materials = new Set(); let triangles = 0;
  model.traverse(object => {
    if (!object.isMesh) return;
    [].concat(object.material).forEach(m => materials.add(m));
    triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3
      * (object.isInstancedMesh ? object.count : 1);
  });
  info.materialCount = materials.size; info.renderTriangles = triangles;
  info.projectId = project.id;
  info.bounds = { min: box.min.toArray(), max: box.max.toArray() };
  model.traverse(object => {
    if (!object.isMesh) return;
    if (object.isInstancedMesh) object.computeBoundingBox();
    else object.geometry.computeBoundingBox();
    const b = object.isInstancedMesh ? object.boundingBox : object.geometry.boundingBox;
    for (let i = 0; i < 8; i++) framingPoints.push(new THREE.Vector3(
      i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(object.matrixWorld));
  });
  const radius = box.getSize(new THREE.Vector3()).length() * .6;
  camera.far = Math.max(200, radius * 12); camera.updateProjectionMatrix();
  orbit.maxDistance = radius * 6;
  installSoftShadows(Math.hypot(layout.width, layout.length));
  surfaceLibrary = await surfacePromise;
  surfaceLibrary.floor.wear = createWearTexture(layout, project);
  configureConcrete(layout, surfaceLibrary.floor.wear);
  const environmentTarget = await hdrPromise;
  scene.environment = environmentTarget.texture;
  prepareMaterials();
  info.floorReplacement = hideConfiguredFloorNodes(model, project.source.floorNodes, sourceIdentity);
  const floorMaterial = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(.38, .4, .41), roughness: .72 });
  floorMaterial.name = "preview-concrete-floor"; attachSurface(floorMaterial, "floor", surfaceLibrary);
  building = createWarehouse(layout, floorMaterial, surfaceLibrary, project.lighting);
  scene.add(building.root, building.floor);
  info.building = building.metrics;
  const batch = batchRepeatedGeometry(model); info.runtimeBatching = batch;
  $("load-title").textContent = "准备光照";
  makeFloorReflection(); makeLightingRig(); updateSettings(); updateQuality(); setView("interior");
  await renderer.compileAsync(scene, camera);
  draw(); ready = true; updateAntialias();
  $("loading").hidden = true; $("scene-status").hidden = false;
  $("download").disabled = $("fit").disabled = false;
  const dimensions = box.getSize(new THREE.Vector3());
  $("scene-size").textContent = `${dimensions.x.toFixed(1)} × ${dimensions.z.toFixed(1)} × ${dimensions.y.toFixed(1)} m`;
  $("scene-stats").textContent = `${(info.renderTriangles / 10000).toFixed(0)}万源三角面 · ${info.materialCount}种材质`;
  $("model-bytes").textContent = info.synthetic ? "合成测试" : `${(info.after.bytes / 1e6).toFixed(1)} MB`;
  $("material-count").textContent = info.materialCount;
  $("pbr-count").textContent = `${info.pbr.materials} 种`;
  $("removed-count").textContent = `${info.floorReplacement.hiddenCount} 个`;
  $("envelope-source").textContent = layout.envelopeSource === "preview-assumption" ? "预览假设" : "项目配置";
  $("unassigned-count").textContent = `${info.pbr.classifications.filter(m => m.source === "unassigned").length} 种`;
  $("model-state").textContent = "已就绪";
  requestRender();
}
init().catch(fail);
