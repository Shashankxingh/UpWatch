import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

/* ================= CONFIG ================= */
const PING_INTERVAL = 2 * 60 * 1000; // 2 minutes
const TIMEOUT = 5000;
const MAX_RETRIES = 2;
const LATENCY_HISTORY_LIMIT = 20;

/* ================= STORE ================= */
const monitors = {};

/*
monitor = {
  name,
  url,
  status,
  lastPing,
  uptime,
  totalPings,
  failedPings,
  retryCount,
  latencyHistory: []
}
*/

/* ================= STATUS ENGINE ================= */
function updateStatus(monitor, success, latency) {
  monitor.totalPings++;

  if (success) {
    monitor.retryCount = 0;
    monitor.status = latency > 1000 ? "DEGRADED" : "UP";
  } else {
    monitor.failedPings++;
    monitor.retryCount++;
    if (monitor.retryCount > MAX_RETRIES) {
      monitor.status = "DOWN";
    }
  }

  monitor.uptime = (
    ((monitor.totalPings - monitor.failedPings) / monitor.totalPings) * 100
  ).toFixed(2);
}

/* ================= PING ================= */
async function pingMonitor(monitor) {
  const start = Date.now();
  try {
    const res = await fetch(monitor.url, { timeout: TIMEOUT });
    const latency = Date.now() - start;

    monitor.lastPing = Date.now();
    monitor.latencyHistory.push(latency);
    if (monitor.latencyHistory.length > LATENCY_HISTORY_LIMIT) {
      monitor.latencyHistory.shift();
    }

    updateStatus(monitor, true, latency);
    console.log(`🟢 ${monitor.name} ${latency}ms`);
  } catch {
    monitor.lastPing = Date.now();
    updateStatus(monitor, false);
    console.log(`🔴 ${monitor.name} DOWN`);
  }
}

/* ================= SCHEDULER ================= */
setInterval(() => {
  Object.values(monitors).forEach(pingMonitor);
}, PING_INTERVAL);

/* ================= API ================= */

// Add monitor
app.post("/api/monitor", (req, res) => {
  const { name, url } = req.body;

  if (!name || !url || !url.startsWith("http")) {
    return res.status(400).json({ message: "Invalid name or URL" });
  }

  if (monitors[name]) {
    return res.status(409).json({ message: "Monitor already exists" });
  }

  monitors[name] = {
    name,
    url,
    status: "INIT",
    lastPing: null,
    uptime: "100.00",
    totalPings: 0,
    failedPings: 0,
    retryCount: 0,
    latencyHistory: []
  };

  pingMonitor(monitors[name]);

  res.json({ message: `✅ ${name} monitoring started` });
});

// List monitors
app.get("/api/monitors", (req, res) => {
  res.json(Object.values(monitors));
});

// Health
app.get("/", (_, res) => {
  res.send("UpWatch backend running 🚀");
});

/* ================= START ================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Backend running on port ${PORT}`)
);