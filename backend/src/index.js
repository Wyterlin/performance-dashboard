const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

const weeklyReportsRouter = require("./routes/weeklyReports");
const ticketsRouter = require("./routes/tickets");

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);

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

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on port ${port}`);
});
