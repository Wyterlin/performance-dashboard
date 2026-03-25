const express = require("express");
const { DEFAULT_SECTIONS, listWeeks, getWeek, upsertWeek } = require("../services/weeklyReportService");

const router = express.Router();

router.get("/defaults/topics", (_req, res) => {
  res.json({ topics: DEFAULT_SECTIONS });
});

router.get("/weeks", async (_req, res, next) => {
  try {
    const weeks = await listWeeks();
    res.json({ weeks });
  } catch (error) {
    next(error);
  }
});

router.get("/weeks/:weekCode", async (req, res, next) => {
  try {
    const week = await getWeek(req.params.weekCode);
    if (!week) {
      return res.status(404).json({ message: "Week not found" });
    }
    res.json({ week });
  } catch (error) {
    next(error);
  }
});

router.put("/weeks/:weekCode", async (req, res, next) => {
  try {
    const week = await upsertWeek({
      ...req.body,
      weekCode: req.params.weekCode,
    });
    res.json({ week });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
