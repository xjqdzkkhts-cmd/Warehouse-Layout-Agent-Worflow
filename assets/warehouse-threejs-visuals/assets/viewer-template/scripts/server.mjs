import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const publicRoot = await fsp.realpath(path.join(root, "public"));
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".glb": "model/gltf-binary",
  ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".hdr": "application/octet-stream" };
await fsp.mkdir(path.join(root, "reports"), { recursive: true });
const server = http.createServer(async (req, res) => {
  try {
    if (!["GET", "HEAD"].includes(req.method)) { res.writeHead(405).end(); return; }
    const url = new URL(req.url, "http://127.0.0.1");
    const p = decodeURIComponent(url.pathname);
    const candidate = path.resolve(publicRoot, `.${p.endsWith("/") ? `${p}index.html` : p}`);
    const filename = await fsp.realpath(candidate);
    if (!filename.startsWith(publicRoot + path.sep)) { res.writeHead(403).end(); return; }
    const stat = await fsp.stat(filename);
    if (!stat.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "Content-Type": types[path.extname(filename)] || "application/octet-stream",
      "Content-Length": stat.size, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    if (req.method === "HEAD") res.end();
    else fs.createReadStream(filename).on("error", () => res.destroy()).pipe(res);
  } catch { res.writeHead(404).end("Not found"); }
});
const port = Number(process.argv[2] || 8891);
server.on("error", error => {
  if (error.code === "EADDRINUSE") server.listen(0, "127.0.0.1");
  else { console.error(error); process.exitCode = 1; }
});
server.on("listening", async () => {
  const info = { url: `http://127.0.0.1:${server.address().port}`, pid: process.pid };
  await fsp.writeFile(path.join(root, "reports/server.json"), JSON.stringify(info, null, 2));
  console.log(JSON.stringify(info));
});
server.listen(port, "127.0.0.1");
