import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import analyzeRoute from "./routes/analyze.js";
import healthRoute from "./routes/health.js";
import reportsRoute from "./routes/reports.js";
import { errorEnvelope } from "../lib/errors.js";
import { loadEnvFile } from "../lib/load-env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.resolve(__dirname, "../public");

loadEnvFile(projectRoot);

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(publicDir));

app.use("/api/analyze", analyzeRoute);
app.use("/api/health", healthRoute);
app.use("/api/reports", reportsRoute);

app.get("/", (_req, res) => {
  return res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/report", (_req, res) => {
  return res.sendFile(path.join(publicDir, "report.html"));
});

app.get("/architecture", (_req, res) => {
  return res.sendFile(path.join(publicDir, "architecture.html"));
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json(errorEnvelope("NOT_FOUND", "API route not found."));
  }
  return res.sendFile(path.join(publicDir, "index.html"));
});

export default function handler(req, res) {
  return app(req, res);
}
