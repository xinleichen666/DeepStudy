const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");
const staticDir = path.join(root, ".next", "static");
const publicDir = path.join(root, "public");

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(source, target);
    else fs.copyFileSync(source, target);
  }
}

if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error("未找到 .next/standalone/server.js，请先运行 npm run build");
  process.exit(1);
}

if (fs.existsSync(publicDir)) {
  copyDir(publicDir, path.join(standalone, "public"));
}
if (fs.existsSync(staticDir)) {
  copyDir(staticDir, path.join(standalone, ".next", "static"));
}

const leakedData = path.join(standalone, "data");
if (fs.existsSync(leakedData)) {
  fs.rmSync(leakedData, { recursive: true, force: true });
}

if (!fs.existsSync(path.join(standalone, "node_modules"))) {
  console.error("standalone 缺少 node_modules，打包后将无法启动");
  process.exit(1);
}

console.log("standalone 已补齐 public 与静态资源，并去掉 data/");
