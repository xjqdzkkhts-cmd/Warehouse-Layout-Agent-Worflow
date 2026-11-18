import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function fileHash(filename) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}
export async function inspectGlb(filename) {
  const handle = await fs.open(filename, "r");
  let json, bytes;
  try {
    const stat = await handle.stat(); bytes = stat.size;
    const header = Buffer.alloc(20);
    const read = await handle.read(header, 0, 20, 0);
    if (read.bytesRead !== 20 || header.toString("ascii", 0, 4) !== "glTF"
      || header.readUInt32LE(4) !== 2 || header.readUInt32LE(8) !== bytes
      || header.readUInt32LE(16) !== 0x4e4f534a) throw new Error("Expected a complete glTF 2.0 binary file");
    const length = header.readUInt32LE(12);
    if (length < 2 || length > 64 * 1024 * 1024 || length + 20 > bytes) throw new Error("Invalid or oversized GLB JSON chunk");
    const buffer = Buffer.alloc(length);
    const chunk = await handle.read(buffer, 0, length, 20);
    if (chunk.bytesRead !== length) throw new Error("Truncated GLB JSON chunk");
    json = JSON.parse(buffer.toString("utf8").replace(/\0+$/, "").trim());
  } finally { await handle.close(); }
  if (!json.asset?.version?.startsWith("2.")) throw new Error("Unsupported glTF asset version");
  const nodes = json.nodes ?? [], meshes = json.meshes ?? [], accessors = json.accessors ?? [];
  const count = index => {
    const value = accessors[index]?.count;
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid accessor count: ${index}`);
    return value;
  };
  const triangles = mesh => (mesh.primitives ?? []).reduce((total, primitive) => {
    const n = count(primitive.indices ?? primitive.attributes?.POSITION);
    const mode = primitive.mode ?? 4;
    return total + (mode === 4 ? n / 3 : mode === 5 || mode === 6 ? Math.max(0, n - 2) : 0);
  }, 0);
  const selected = json.scenes?.[json.scene ?? 0];
  if (!selected) throw new Error("GLB has no default scene");
  const stack = [...(selected.nodes ?? [])], visited = new Set(), usedMeshes = new Set();
  let sourceTriangles = 0, gpuInstanceNodes = 0, meshNodes = 0;
  while (stack.length) {
    const index = stack.pop(), node = nodes[index];
    if (!node || visited.has(index)) throw new Error("Invalid or non-tree scene hierarchy");
    visited.add(index); stack.push(...(node.children ?? []));
    if (node.mesh === undefined) continue;
    if (!meshes[node.mesh]) throw new Error("Invalid mesh reference");
    const attributes = node.extensions?.EXT_mesh_gpu_instancing?.attributes;
    let instances = 1;
    if (attributes) {
      const counts = Object.values(attributes).map(count);
      if (!counts.length || counts.some(n => n !== counts[0])) throw new Error("Inconsistent GPU instance attributes");
      instances = counts[0]; gpuInstanceNodes++;
    }
    sourceTriangles += triangles(meshes[node.mesh]) * instances;
    usedMeshes.add(node.mesh); meshNodes++;
  }
  const externalResources = [...(json.buffers ?? []), ...(json.images ?? [])]
    .map(item => item.uri).filter(uri => typeof uri === "string" && !uri.startsWith("data:"));
  const materials = (json.materials ?? []).map((material, index) => ({
    index, name: material.name ?? "", role: material.extras?.materialRole ?? null,
    alphaMode: material.alphaMode ?? "OPAQUE",
    baseColorTexture: material.pbrMetallicRoughness?.baseColorTexture !== undefined,
    normalTexture: material.normalTexture !== undefined,
    metallicRoughnessTexture: material.pbrMetallicRoughness?.metallicRoughnessTexture !== undefined,
    unlit: Boolean(material.extensions?.KHR_materials_unlit),
    transmission: material.extensions?.KHR_materials_transmission?.transmissionFactor ?? 0,
  }));
  const warnings = [];
  const requiredDecoders = ["KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu"]
    .filter(name => (json.extensionsUsed ?? []).includes(name) || (json.extensionsRequired ?? []).includes(name));
  const sourceLights = json.extensions?.KHR_lights_punctual?.lights?.length ?? 0;
  if (sourceTriangles > 10_000_000) warnings.push("Large input: test a bounded region before enabling all effects.");
  if (externalResources.length) warnings.push("External resources exist; a single-file copy is insufficient.");
  if (requiredDecoders.length) warnings.push("This starter has no compressed mesh/texture decoder configured.");
  if (sourceLights) warnings.push("Review source lighting before adding the template lighting rig.");
  if (json.skins?.length || json.animations?.length) warnings.push("This template is a static preview; animation playback is not an acceptance claim.");
  if (materials.some(m => !m.role)) warnings.push("Review material roles; material names are not automatic classification.");
  return {
    bytes, sha256: await fileHash(filename), selectedScene: json.scene ?? 0,
    sourceTriangles, uniqueMeshDefinitions: usedMeshes.size, meshNodes, gpuInstanceNodes,
    nodes: [...visited].map(index => ({ index, name: nodes[index].name ?? "", mesh: nodes[index].mesh ?? null })),
    materials, extensionsUsed: json.extensionsUsed ?? [], externalResources, requiredDecoders, sourceLights, warnings,
    measurementNote: "Triangles include active-scene GPU instance counts, not camera-visible work or GPU frame cost.",
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error("Usage: node inspect-glb.mjs model.glb");
  console.log(JSON.stringify(await inspectGlb(path.resolve(process.argv[2])), null, 2));
}
