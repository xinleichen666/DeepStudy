const { app, BrowserWindow, Menu, shell, dialog } = require("electron");
const { fork } = require("child_process");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

const DEV_URL = process.env.ELECTRON_START_URL || "http://127.0.0.1:3000";

let serverProcess = null;
let stopping = false;

function isPackaged() {
  return app.isPackaged;
}

function resolveDataDir() {
  if (process.env.DEEPSTUDY_DATA_DIR) return process.env.DEEPSTUDY_DATA_DIR;
  if (!isPackaged()) return path.join(process.cwd(), "data");
  return path.join(app.getPath("userData"), "data");
}

function standaloneDir() {
  if (isPackaged()) return path.join(process.resourcesPath, "standalone");
  return path.join(__dirname, "..", ".next", "standalone");
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
    server.on("error", reject);
  });
}

function waitForUrl(url, timeoutMs = 60000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        const code = res.statusCode || 0;
        res.resume();
        if (code >= 500) {
          if (Date.now() - started > timeoutMs) {
            reject(new Error("应用首页启动失败"));
            return;
          }
          setTimeout(tick, 400);
          return;
        }
        resolve(url);
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error("应用服务启动超时"));
          return;
        }
        setTimeout(tick, 250);
      });
      req.setTimeout(2000, () => {
        req.destroy();
      });
    };
    tick();
  });
}

function startStandalone(port, dataPath) {
  const dir = standaloneDir();
  const serverJs = path.join(dir, "server.js");
  if (!fs.existsSync(serverJs)) {
    throw new Error(`找不到打包后的服务文件：${serverJs}`);
  }
  const logs = [];
  const collect = (chunk) => {
    const text = String(chunk);
    logs.push(text);
    if (logs.join("").length > 8000) logs.shift();
  };
  serverProcess = fork(serverJs, [], {
    cwd: dir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      DEEPSTUDY_DATA_DIR: dataPath,
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  serverProcess.stdout?.on("data", collect);
  serverProcess.stderr?.on("data", collect);
  serverProcess.on("exit", (code, signal) => {
    serverProcess = null;
    if (stopping) return;
    const tail = logs.join("").replace(/\s+/g, " ").trim().slice(-600);
    const why = tail || `退出码 ${code ?? signal ?? "unknown"}`;
    dialog.showErrorBox(
      "研迹",
      `本地服务已退出。\n\n${why}\n\n请重新打开研迹。不要用任务管理器结束 node.exe。`,
    );
    app.quit();
  });
}

function installMenu() {
  const template = [
    {
      label: "研迹",
      submenu: [
        {
          label: "打开数据目录",
          click: () => shell.openPath(resolveDataDir()),
        },
        { type: "separator" },
        { role: "quit", label: "退出" },
      ],
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo", label: "撤销" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪切" },
        { role: "copy", label: "复制" },
        { role: "paste", label: "粘贴" },
        { role: "selectAll", label: "全选" },
      ],
    },
    {
      label: "窗口",
      submenu: [
        { role: "reload", label: "重新加载" },
        { role: "toggleDevTools", label: "开发者工具" },
        { type: "separator" },
        { role: "minimize", label: "最小化" },
        { role: "close", label: "关闭窗口" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function attachWindow(win, origin) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === "about:blank" || url.startsWith("about:blank") || url.startsWith(origin)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 1100,
          height: 840,
          minWidth: 720,
          minHeight: 560,
          autoHideMenuBar: true,
          backgroundColor: "#f7f1e6",
        },
      };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(origin) || url.startsWith("about:")) return;
    event.preventDefault();
    shell.openExternal(url);
  });
}

function createWindow(origin) {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 560,
    title: "研迹 DeepStudy",
    backgroundColor: "#f7f1e6",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  attachWindow(win, origin);
  win.loadURL(origin);
}

async function boot() {
  const dataPath = resolveDataDir();
  fs.mkdirSync(dataPath, { recursive: true });
  installMenu();

  if (!isPackaged()) {
    await waitForUrl(DEV_URL);
    createWindow(DEV_URL.replace(/\/$/, ""));
    return;
  }

  const port = await getFreePort();
  const origin = `http://127.0.0.1:${port}`;
  startStandalone(port, dataPath);
  await waitForUrl(origin);
  createWindow(origin);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(() =>
    boot().catch((error) => {
      dialog.showErrorBox("研迹无法启动", error instanceof Error ? error.message : String(error));
      app.quit();
    }),
  );
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopping = true;
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
