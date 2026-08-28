const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const root = path.join(__dirname, "..");
const CANDIDATES = ["http://127.0.0.1:3000", "http://localhost:3000", "http://[::1]:3000"];

function probe(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 1500 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function findServer() {
  for (const url of CANDIDATES) {
    if (await probe(url)) return url;
  }
  return null;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(timeoutMs = 25000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const url = await findServer();
    if (url) return url;
    await wait(250);
  }
  throw new Error("开发服务未在 http://127.0.0.1:3000 启动");
}

(async () => {
  let nextProc = null;
  let origin = await findServer();

  if (!origin) {
    nextProc = spawn("npm", ["run", "dev"], {
      cwd: root,
      stdio: "inherit",
      shell: true,
    });
    nextProc.on("exit", (code) => {
      nextProc = null;
      if (code) {
        // 多半是目录里已经有一份 next dev，接着去接已有服务
      }
    });
    origin = await waitForServer();
  }

  const electron = spawn("npx", ["electron", "."], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ELECTRON_START_URL: origin },
  });
  electron.on("exit", (code) => {
    if (nextProc) nextProc.kill();
    process.exit(code ?? 0);
  });
})().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
