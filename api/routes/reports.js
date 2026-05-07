import express from "express";
import { successEnvelope } from "../../lib/errors.js";
import { getRecentReports } from "../../lib/report-store.js";

const router = express.Router();

router.get("/", async (_req, res) => {
  try {
    const reports = await getRecentReports(8);
    return res.status(200).json(successEnvelope({ reports }));
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch recent reports.";
    console.log(`[warn] recent_reports_unavailable=${message}`);
    return res
      .status(200)
      .json(successEnvelope({ reports: [], warning: "Recent reports unavailable." }));
  }
});

export default router;
