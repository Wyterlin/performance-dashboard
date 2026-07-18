const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

const weeklyReportsRouter = require("./routes/weeklyReports");
const ticketsRouter = require("./routes/tickets");

dotenv.config();

/**
 * Monta o app Express sem chamar listen(), para poder ser usado tanto pelo
 * servidor local (index.js) quanto pela function serverless do Vercel (/api).
 */
function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "performance-dashboard-backend" });
  });

  app.use("/api", weeklyReportsRouter);
  app.use("/api/tickets", ticketsRouter);

  app.use((error, _req, res, _next) => {
    res.status(400).json({
      message: error.message || "Unexpected error",
    });
  });

  return app;
}

module.exports = { createApp };
