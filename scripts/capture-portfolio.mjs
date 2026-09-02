import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const rootDir = path.resolve(import.meta.dirname, "..");
const outputDir = path.join(rootDir, "docs", "portfolio", "screenshots");
const nextEnvPath = path.join(rootDir, "next-env.d.ts");
const originalNextEnv = await fs.readFile(nextEnvPath);
const targetUrl = new URL(process.env.PORTFOLIO_URL || "http://127.0.0.1:3100");
const sessionToken = "miniauth-portfolio-session";

if (targetUrl.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(targetUrl.hostname)) {
  throw new Error("PORTFOLIO_URL must be an HTTP loopback URL so demo data cannot reach a remote service.");
}

const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), "miniauth-portfolio-"));
const databasePath = path.join(temporaryDir, "miniauth-portfolio.db");
const databaseUrl = `file:${databasePath}`;
const chromeProfile = path.join(temporaryDir, "chrome-profile");
const port = Number(targetUrl.port || 80);
const chromePort = await getOpenPort();
const environment = {
  ...process.env,
  APP_NAME: "MiniAuth",
  AUTH_COOKIE_NAME: "miniauth_portfolio_session",
  BASE_URL: targetUrl.origin,
  DATABASE_URL: databaseUrl,
  DEFAULT_LOCALE: "EN",
  PORTFOLIO_CAPTURE: "1",
};

let server;
let chrome;

try {
  const schemaSql = await runForOutput(
    path.join(rootDir, "node_modules", ".bin", "prisma"),
    ["migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"],
    environment,
  );
  await runWithInput("sqlite3", [databasePath], environment, schemaSql);
  await run(process.execPath, ["--experimental-strip-types", path.join(rootDir, "scripts", "seed-portfolio.ts")], environment);

  server = spawn(path.join(rootDir, "node_modules", ".bin", "next"), ["dev", "--hostname", targetUrl.hostname, "--port", String(port)], {
    cwd: rootDir,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  pipeWithPrefix(server.stdout, "next");
  pipeWithPrefix(server.stderr, "next");
  await waitForUrl(new URL("/api/health", targetUrl));

  const chromePath = await findChrome();
  chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-sandbox",
    `--remote-debugging-port=${chromePort}`,
    `--user-data-dir=${chromeProfile}`,
    "about:blank",
  ], { stdio: "ignore" });

  const pageTarget = await createChromePage(chromePort, targetUrl.href);
  const client = await createCdpClient(pageTarget.webSocketDebuggerUrl);

  await client.send("Page.enable");
  await client.send("Network.enable");
  await client.send("Emulation.setTimezoneOverride", { timezoneId: "America/Los_Angeles" });
  await client.send("Emulation.setLocaleOverride", { locale: "en-US" });
  await client.send("Emulation.setEmulatedMedia", {
    media: "screen",
    features: [
      { name: "prefers-color-scheme", value: "light" },
      { name: "prefers-reduced-motion", value: "reduce" },
    ],
  });
  await client.send("Network.setCookie", {
    name: environment.AUTH_COOKIE_NAME,
    value: sessionToken,
    url: targetUrl.origin,
    httpOnly: true,
    sameSite: "Lax",
  });
  await client.send("Network.setCookie", { name: "mini_locale", value: "en", url: targetUrl.origin });
  await client.send("Network.setCookie", { name: "mini_theme", value: "light", url: targetUrl.origin });
  await client.send("Network.setCookie", { name: "mini_accent", value: "blue", url: targetUrl.origin });

  await setViewport(client, 1440, 1000);
  const loaded = client.waitFor("Page.loadEventFired");
  await client.send("Page.navigate", { url: targetUrl.href });
  await loaded;
  await client.send("Runtime.evaluate", {
    expression: `(async () => {
      await document.fonts.ready;
      while (!document.querySelector('.hero-metrics')) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      document.querySelector('nextjs-portal')?.remove();
      document.activeElement?.blur();
      window.scrollTo(0, 0);
    })()`,
    awaitPromise: true,
  });

  await fs.mkdir(outputDir, { recursive: true });
  await capture(client, path.join(outputDir, "01-admin-overview.png"));

  await client.send("Runtime.evaluate", {
    expression: `(async () => {
      const heading = [...document.querySelectorAll('h2')].find((element) => element.textContent?.trim() === 'People and access');
      const section = heading?.closest('section');
      if (!section) throw new Error('People and access section was not found');
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, section.getBoundingClientRect().top + window.scrollY);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    })()`,
    awaitPromise: true,
  });
  await capture(client, path.join(outputDir, "02-people-and-access.png"));

  await setViewport(client, 1440, 720);
  await client.send("Runtime.evaluate", { expression: "window.scrollTo(0, 0)" });
  await capture(client, path.join(outputDir, "social-preview.png"));

  client.close();
  console.log(`Portfolio screenshots written to ${path.relative(rootDir, outputDir)}`);
} finally {
  server?.kill("SIGTERM");
  chrome?.kill("SIGTERM");
  await fs.writeFile(nextEnvPath, originalNextEnv);
  await fs.rm(temporaryDir, { recursive: true, force: true });
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: rootDir, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} exited with code ${code}`)));
  });
}

function runForOutput(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: rootDir, env, stdio: ["ignore", "pipe", "inherit"] });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve(output) : reject(new Error(`${path.basename(command)} exited with code ${code}`)));
  });
}

function runWithInput(command, args, env, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: rootDir, env, stdio: ["pipe", "inherit", "inherit"] });
    child.stdin.end(input);
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} exited with code ${code}`)));
  });
}

function pipeWithPrefix(stream, prefix) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => process.stdout.write(`[${prefix}] ${chunk}`));
}

async function waitForUrl(url) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function getOpenPort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address();
      socket.close(() => resolve(address.port));
    });
  });
}

async function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }
  throw new Error("Chrome or Chromium was not found. Set CHROME_PATH to its executable.");
}

async function createChromePage(debugPort, url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out connecting to Chrome DevTools.");
}

async function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  const listeners = new Map();
  let nextId = 1;

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
      return;
    }

    const eventListeners = listeners.get(message.method) || [];
    listeners.delete(message.method);
    eventListeners.forEach((resolve) => resolve(message.params));
  });

  return {
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    waitFor(method) {
      return new Promise((resolve) => {
        listeners.set(method, [...(listeners.get(method) || []), resolve]);
      });
    },
    close() {
      socket.close();
    },
  };
}

async function setViewport(client, width, height) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: false,
  });
}

async function capture(client, outputPath) {
  const result = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await fs.writeFile(outputPath, Buffer.from(result.data, "base64"));
}
