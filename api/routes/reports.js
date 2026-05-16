import express from "express";
import {
  createAppError,
  errorEnvelope,
  ERROR_CODES,
  normalizeError,
  successEnvelope
} from "../../lib/errors.js";
import { getRecentReports, getReportById } from "../../lib/report-store.js";

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

router.get("/:id", async (req, res) => {
  try {
    const report = await getReportById(req.params.id);
    if (!report) {
      throw createAppError(
        ERROR_CODES.REPORT_NOT_FOUND,
        "Report not found.",
        404
      );
    }
    return res.status(200).json(successEnvelope(report));
  } catch (err) {
    const normalized = normalizeError(err);
    return res
      .status(normalized.status)
      .json(errorEnvelope(normalized.code, normalized.message));
  }
});

export default router;
