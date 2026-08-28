const fs = require("fs");
const path = require("path");

exports.default = async function afterPack(context) {
  const src = path.join(context.packager.projectDir, ".next", "standalone", "node_modules");
  const dest = path.join(context.appOutDir, "resources", "standalone", "node_modules");
  if (!fs.existsSync(src)) {
    throw new Error(`standalone 缺少 node_modules：${src}`);
  }
  fs.cpSync(src, dest, { recursive: true, force: true });
  const leaked = path.join(context.appOutDir, "resources", "standalone", "data");
  if (fs.existsSync(leaked)) {
    fs.rmSync(leaked, { recursive: true, force: true });
  }
  if (!fs.existsSync(path.join(dest, "next"))) {
    throw new Error("打包后仍未找到 standalone/node_modules/next");
  }
};
