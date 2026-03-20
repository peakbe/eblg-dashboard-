import express from "express";
import fetch from "node-fetch";

const app = express();

app.get("/fids", async (req, res) => {
  try {
    const url = req.query.url;
    const r = await fetch(url);
    const data = await r.text();
    res.set("Access-Control-Allow-Origin", "*");
    res.send(data);
  } catch (e) {
    res.status(500).send("Proxy error: " + e.toString());
  }
});

app.listen(3000, () => console.log("Proxy running on port 3000"));
