import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware CORS global
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Proxy principal
app.get("/fids", async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: "Missing url parameter" });

    const r = await fetch(url);
    const data = await r.text();

    res.setHeader("Content-Type", r.headers.get("content-type") || "application/json");
    res.send(data);

  } catch (err) {
    res.status(500).json({ error: "Proxy error", details: err.toString() });
  }
});

app.listen(PORT, () => console.log("Proxy running on port " + PORT));
