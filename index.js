import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

/* ================= CONFIG ================= */
// More aggressive polling for "Live" feel
const PING_INTERVAL = 10000; // 10 seconds
const TIMEOUT = 3000;
const MAX_RETRIES = 2;
const LATENCY_HISTORY_LIMIT = 40; // More data points for the sparkline chart

/* ================= STORE ================= */
const monitors = {};

/* ================= STATUS ENGINE ================= */
function updateStatus(monitor, success, latency) {
  monitor.totalPings++;

  if (success) {
    monitor.retryCount = 0;
    // Thresholds: Green < 500ms, Yellow < 1000ms, Red > 1000ms
    monitor.status = latency > 1000 ? "DEGRADED" : "OPERATIONAL";
  } else {
    monitor.failedPings++;
    monitor.retryCount++;
    if (monitor.retryCount >= MAX_RETRIES) {
      monitor.status = "DOWN";
    }
  }

  // Calculate precise availability
  const availability = ((monitor.totalPings - monitor.failedPings) / monitor.totalPings) * 100;
  monitor.uptime = availability.toFixed(2);
}

/* ================= PING LOGIC ================= */
async function pingMonitor(monitor) {
  const start = Date.now();
  try {
    const res = await fetch(monitor.url, { timeout: TIMEOUT });
    
    // Simulate slight network jitter for realism if latency is 0
    let latency = Date.now() - start; 
    if(latency === 0) latency = 1;

    monitor.lastPing = Date.now();
    monitor.latencyHistory.push(latency);
    
    if (monitor.latencyHistory.length > LATENCY_HISTORY_LIMIT) {
      monitor.latencyHistory.shift();
    }

    updateStatus(monitor, res.ok, latency);
  } catch (err) {
    monitor.lastPing = Date.now();
    // Push a null or high value for charts to indicate drop
    monitor.latencyHistory.push(0); 
    if (monitor.latencyHistory.length > LATENCY_HISTORY_LIMIT) {
      monitor.latencyHistory.shift();
    }
    updateStatus(monitor, false, 0);
  }
}

/* ================= SCHEDULER ================= */
setInterval(() => {
  Object.values(monitors).forEach(pingMonitor);
}, PING_INTERVAL);

/* ================= API ================= */

app.post("/api/monitor", (req, res) => {
  const { name, url } = req.body;
  if (!name || !url || !url.startsWith("http")) {
    return res.status(400).json({ error: "Invalid parameters" });
  }
  
  if (monitors[name]) return res.status(409).json({ error: "Monitor exists" });

  monitors[name] = {
    id: Date.now().toString(), // Stable ID
    name,
    url,
    status: "PENDING",
    lastPing: null,
    uptime: "100.00",
    totalPings: 0,
    failedPings: 0,
    retryCount: 0,
    latencyHistory: []
  };

  // Immediate first ping
  pingMonitor(monitors[name]);
  res.json({ message: "Monitoring started" });
});

app.get("/api/monitors", (req, res) => {
  // Return stats summary along with monitors
  const monitorList = Object.values(monitors);
  const total = monitorList.length;
  const down = monitorList.filter(m => m.status === "DOWN").length;
  
  res.json({
    stats: { total, down, operational: total - down },
    monitors: monitorList
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 UpWatch Enterprise Core on ${PORT}`));
