import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

/* ================= CONFIG ================= */
const PING_INTERVAL = 2 * 60 * 1000;
const TIMEOUT = 5000;
const MAX_RETRIES = 2;
const LATENCY_HISTORY = 30;

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
   latencyHistory: [],
   retryCount
 }
*/

/* ================= STATUS ENGINE ================= */
function evaluateStatus(monitor, success, latency) {
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
    if (monitor.latencyHistory.length > LATENCY_HISTORY) {
      monitor.latencyHistory.shift();
    }

    evaluateStatus(monitor, true, latency);

    console.log(`🟢 ${monitor.name} ${latency}ms`);
  } catch {
    monitor.lastPing = Date.now();
    evaluateStatus(monitor, false);
    console.log(`🔴 ${monitor.name} failed`);
  }
}

/* ================= SCHEDULER ================= */
setInterval(() => {
  Object.values(monitors).forEach(pingMonitor);
}, PING_INTERVAL);

/* ================= API ================= */

/* ADD MONITOR */
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
    latencyHistory: [],
    retryCount: 0
  };

  pingMonitor(monitors[name]);

  res.json({
    message: `✅ ${name} monitoring started`
  });
});

/* LIST MONITORS */
app.get("/api/monitors", (req, res) => {
  res.json(Object.values(monitors));
});

/* HEALTH */
app.get("/", (_, res) => {
  res.send("UpWatch V2 running 🚀");
});

/* START */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`UpWatch backend on ${PORT}`);
});