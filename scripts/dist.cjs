const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
process.env.ELECTRON_MIRROR = process.env.ELECTRON_MIRROR || "https://npmmirror.com/mirrors/electron/";
process.env.ELECTRON_BUILDER_BINARIES_MIRROR =
  process.env.ELECTRON_BUILDER_BINARIES_MIRROR || "https://npmmirror.com/mirrors/electron-builder-binaries/";

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  if (result.status) process.exit(result.status);
}

run("npx", ["next", "build"]);
run("node", ["scripts/prepare-standalone.cjs"]);
run("npx", ["electron-builder", "--win"]);
