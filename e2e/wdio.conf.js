import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { basename } from "node:path";
import { helmBinary, prepareVault, removeVault, tauriDriverBin } from "./support/vault.js";

/**
 * WebDriver suite for the real Helm window.
 *
 * Add a case as two files that share a name:
 *   e2e/specs/<name>.e2e.js
 *   e2e/vaults/<name>.js   exporting seed(vaultPath)
 * Vitest ignores e2e/, so `npm test` never starts this window.
 */

let driver;
let sessionRoot;
let shuttingDown = false;

export const config = {
  runner: "local",
  hostname: "127.0.0.1",
  port: 4444,
  specs: ["./specs/**/*.e2e.js"],
  maxInstances: 1,
  capabilities: [
    {
      maxInstances: 1,
      "tauri:options": {
        application: helmBinary(),
      },
    },
  ],
  logLevel: "warn",
  outputDir: "./.artifacts",
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 90000,
  },
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,

  async beforeSession(_conf, capabilities, specs) {
    const binary = helmBinary();
    if (!existsSync(binary)) {
      throw new Error(
        `Missing ${binary}. npm run test:e2e builds it with: npm run tauri build -- --debug --no-bundle`,
      );
    }
    const driverBin = tauriDriverBin();
    if (!existsSync(driverBin)) {
      throw new Error(
        `Missing tauri-driver (${driverBin}). Install it with: cargo install tauri-driver --locked`,
      );
    }

    const spec = specs[0] ?? "";
    const name = basename(spec).replace(/\.e2e\.js$/, "");
    const mod = await import(new URL(`./vaults/${name}.js`, import.meta.url).href);
    if (typeof mod.seed !== "function") {
      throw new Error(`e2e/vaults/${name}.js must export seed(vaultPath)`);
    }
    const prepared = prepareVault(mod.seed);
    sessionRoot = prepared.root;
    process.env.HELM_E2E_VAULT = prepared.vaultPath;

    const cap = Array.isArray(capabilities) ? capabilities[0] : capabilities;
    cap["tauri:options"].application = prepared.launcher;

    await startDriver(driverBin);
  },

  async afterSession() {
    await stopDriver();
    removeVault(sessionRoot);
    sessionRoot = undefined;
    delete process.env.HELM_E2E_VAULT;
  },
};

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (open) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function waitForPort(port, open, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((await portOpen(port)) === open) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`tauri-driver port ${port} did not become ${open ? "open" : "closed"}`);
}

async function startDriver(driverBin) {
  if (await portOpen(4444)) {
    throw new Error(
      "Port 4444 is already in use. Quit the other tauri-driver and run the suite again.",
    );
  }
  shuttingDown = false;
  driver = spawn(driverBin, [], {
    detached: true,
    stdio: ["ignore", "inherit", "inherit"],
  });
  driver.on("error", (error) => {
    console.error("tauri-driver error:", error);
  });
  driver.on("exit", (code) => {
    if (!shuttingDown) console.error(`tauri-driver exited with code ${code}`);
  });
  driver.unref();
  await waitForPort(4444, true, 15000);
}

async function stopDriver() {
  shuttingDown = true;
  const pid = driver?.pid;
  driver = undefined;
  if (!pid) return;
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
  try {
    await waitForPort(4444, false, 10000);
  } catch {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}
