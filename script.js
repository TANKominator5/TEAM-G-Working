try { require("dotenv").config(); } catch (e) {}
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

app.get("/health", (req, res) =>
  res.json({ status: "ok", project: "Team G: Bot Detection Gateway", stack: "node" })
);

app.post("/api/score", (req, res) => {
  // TODO: Body: request features -> {score, decision}
  res.status(501).json({ error: "Not implemented", todo: "Body: request features -> {score, decision}" });
});

app.get("/api/stats", (req, res) => {
  // TODO: Allowed vs blocked counts
  res.status(501).json({ error: "Not implemented", todo: "Allowed vs blocked counts" });
});

app.get("/protected", (req, res) => {
  // TODO: Demo route guarded by your middleware
  res.status(501).json({ error: "Not implemented", todo: "Demo route guarded by your middleware" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Team G server running on http://localhost:${PORT}`));
