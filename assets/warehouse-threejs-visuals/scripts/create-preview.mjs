import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { inspectGlb, fileHash } from "./inspect-glb.mjs";
import { validateProject } from "../assets/viewer-template/src/project.mjs";
import { materialProfiles } from "../assets/viewer-template/src/material-profiles.mjs";

export async function createPreview(options) {
  if (!options.out) throw new Error("--out is required");
  const destination = path.resolve(options.out);
  try {
    await fs.lstat(destination);
    throw new Error("Output directory already exists; choose a new directory");
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  const id = options.id ?? "scene-test";
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("Use a lowercase project id containing letters, digits and hyphens");
  if (options.model && ["compact-test", "tall-test"].includes(id)) throw new Error("Project id conflicts with a bundled sample");
  let project, audit, model;
  if (options.model) {
    if (!options["confirm-equipment-scene"]) throw new Error("Confirm this is a supported single-floor equipment scene before generating a preview envelope");
    model = await fs.realpath(path.resolve(options.model));
    audit = await inspectGlb(model);
    if (audit.externalResources.length) throw new Error("Use a self-contained GLB or resolve external resources before creating this preview");
    if (audit.requiredDecoders.length) throw new Error(`Required decoders are not bundled: ${audit.requiredDecoders.join(", ")}`);
    if (audit.sourceLights) throw new Error("Source lighting needs an explicit integration decision; do not add a second rig automatically");
    const supplied = options.config ? JSON.parse(await fs.readFile(path.resolve(options.config), "utf8")) : {};
    const floorY = options["floor-y"] !== undefined ? Number(options["floor-y"]) : supplied.floorY;
    if (!Number.isFinite(floorY)) throw new Error("Provide the confirmed ground elevation with --floor-y or config.floorY");
    project = validateProject({
      ...supplied, schemaVersion: 1, id, title: options.title ?? supplied.title ?? "仓储场景测试",
      units: supplied.units ?? "meter", upAxis: supplied.upAxis ?? "Y", floorY,
      source: { type: "glb", url: "./assets/models/input.glb", floorNodes: supplied.source?.floorNodes ?? [] },
    });
    for (const role of Object.values(project.materialBindings)) {
      if (role !== "preserve" && !Object.hasOwn(materialProfiles, role)) throw new Error(`Unknown material role: ${role}`);
    }
    for (const name of project.source.floorNodes) {
      if (audit.nodes.filter(node => node.name === name).length !== 1) throw new Error(`Floor node is missing or ambiguous: ${name}`);
    }
    if (!project.source.floorNodes.length && !options["no-source-floor"]) {
      throw new Error("Identify old floor nodes in config.source.floorNodes, or explicitly confirm --no-source-floor");
    }
    if (project.source.floorNodes.length && options["no-source-floor"]) throw new Error("Conflicting floor declarations");
    audit.needsMaterialReview = audit.materials.some(m => !m.role && !Object.hasOwn(project.materialBindings, m.name));
  } else if (options.config || options["floor-y"] !== undefined) {
    throw new Error("A model is required when supplying model-specific configuration");
  }
  const template = fileURLToPath(new URL("../assets/viewer-template", import.meta.url));
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(template, destination, { recursive: true, force: false, errorOnExist: true });
  await fs.mkdir(path.join(destination, "reports"), { recursive: true });
  if (model) {
    const models = path.join(destination, "public/assets/models");
    await fs.mkdir(models, { recursive: true });
    await fs.copyFile(model, path.join(models, "input.glb"));
    if (await fileHash(path.join(models, "input.glb")) !== audit.sha256) throw new Error("Model changed while being copied; do not use this output");
    const projects = path.join(destination, "public/projects");
    const catalog = JSON.parse(await fs.readFile(path.join(projects, "catalog.json"), "utf8"));
    await fs.writeFile(path.join(projects, `${id}.json`), JSON.stringify(project, null, 2));
    await fs.writeFile(path.join(projects, "catalog.json"), JSON.stringify([{ id, title: project.title }, ...catalog], null, 2));
    await fs.writeFile(path.join(destination, "reports/input-audit.json"), JSON.stringify(audit, null, 2));
  }
  return { output: destination, project: project?.id ?? "compact-test", modelCopiedUnchanged: Boolean(model),
    next: "Review project JSON and material roles, then run: node scripts/start-server.mjs" };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: {
    out: { type: "string" }, model: { type: "string" }, config: { type: "string" },
    id: { type: "string" }, title: { type: "string" }, "floor-y": { type: "string" },
    "confirm-equipment-scene": { type: "boolean", default: false },
    "no-source-floor": { type: "boolean", default: false },
  } });
  console.log(JSON.stringify(await createPreview(values), null, 2));
}
