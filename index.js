import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

/*
  FREE PLAN RULE:
  Fixed ping every 2 minutes
*/
const PING_INTERVAL = 2 * 60 * 1000;

/*
  In-memory monitor store (v1)
  Structure:
  monitors[name] = {
    url,
    timer,
    lastPing,
    status
  }
*/
const monitors = {};

/* ---------- PING FUNCTION ---------- */
async function pingService(name, url) {
  try {
    const start = Date.now();
    const res = await fetch(url, { timeout: 5000 });
    const latency = Date.now() - start;

    monitors[name].status = "UP";
    monitors[name].lastPing = Date.now();

    console.log(`🟢 [${name}] UP (${res.status}) ${latency}ms`);
  } catch (err) {
    monitors[name].status = "DOWN";
    monitors[name].lastPing = Date.now();

    console.log(`🔴 [${name}] DOWN`);
  }
}

/* ---------- ADD MONITOR ---------- */
app.post("/api/monitor", (req, res) => {
  const { name, url } = req.body;

  // Validation
  if (!name || !url || !url.startsWith("http")) {
    return res.status(400).json({
      message: "Name and valid URL are required."
    });
  }

  // Prevent name collision
  if (monitors[name]) {
    return res.status(409).json({
      message: "Monitor name already exists. Choose a unique name."
    });
  }

  // Create monitor
  monitors[name] = {
    url,
    status: "INIT",
    lastPing: null,
    timer: null
  };

  // Immediate ping
  pingService(name, url);

  // Schedule ping
  const timer = setInterval(() => {
    pingService(name, url);
  }, PING_INTERVAL);

  monitors[name].timer = timer;

  res.json({
    message: `✅ "${name}" is now kept alive (ping every 2 minutes).`
  });
});

/* ---------- LIST MONITORS ---------- */
app.get("/api/monitors", (req, res) => {
  const data = Object.entries(monitors).map(([name, m]) => ({
    name,
    url: m.url,
    status: m.status,
    lastPing: m.lastPing
  }));

  res.json(data);
});

/* ---------- HEALTH CHECK ---------- */
app.get("/", (req, res) => {
  res.send("UpWatch backend is running 🚀");
});

/* ---------- START SERVER ---------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`UpWatch backend running on port ${PORT}`);
});
