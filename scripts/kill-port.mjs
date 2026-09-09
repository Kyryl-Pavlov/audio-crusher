import { execSync } from "node:child_process";
import os from "node:os";

const port = process.argv[2];
if (!port) {
  console.error("Usage: node kill-port.mjs <port>");
  process.exit(1);
}

function killWindows(port) {
  let output;
  try {
    // Get-NetTCPConnection covers both IPv4 and IPv6 listeners; plain
    // `netstat -p tcp` silently omits IPv6-only sockets (e.g. ::1),
    // which Vite's dev server can end up bound to on this host.
    output = execSync(
      `powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue).OwningProcess"`,
      { encoding: "utf8" },
    );
  } catch {
    return;
  }
  const pids = new Set(output.split(/\s+/).map((s) => s.trim()).filter(Boolean));
  for (const pid of pids) {
    try {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
      console.log(`[kill-port] closed previous server on port ${port} (pid ${pid})`);
    } catch {
      // already gone
    }
  }
}

function killUnix(port) {
  let output;
  try {
    output = execSync(`lsof -ti tcp:${port}`, { encoding: "utf8" });
  } catch {
    return;
  }
  const pids = output.split("\n").map((s) => s.trim()).filter(Boolean);
  for (const pid of pids) {
    try {
      execSync(`kill -9 ${pid}`);
      console.log(`[kill-port] closed previous server on port ${port} (pid ${pid})`);
    } catch {
      // already gone
    }
  }
}

if (os.platform() === "win32") {
  killWindows(port);
} else {
  killUnix(port);
}
