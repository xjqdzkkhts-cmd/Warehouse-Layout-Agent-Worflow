import { spawn } from "node:child_process";
import { openSync, closeSync } from "node:fs";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
await fs.mkdir(`${root}reports`, { recursive: true });
const log = openSync(`${root}reports/server.log`, "a");
const child = spawn(process.execPath, [`${root}scripts/server.mjs`, process.argv[2] || "8891"], {
  cwd: root, detached: true, stdio: ["ignore", log, log],
});
child.unref(); closeSync(log);
for (let i = 0; i < 60; i++) {
  await new Promise(resolve => setTimeout(resolve, 250));
  try {
    const info = JSON.parse(await fs.readFile(`${root}reports/server.json`, "utf8"));
    if (info.pid === child.pid && (await fetch(info.url)).ok) { console.log(JSON.stringify(info)); process.exit(0); }
  } catch {}
}
throw new Error("Preview server did not become ready; inspect reports/server.log.");
