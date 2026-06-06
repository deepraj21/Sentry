import express from "express";
import {
  createAppError,
  errorEnvelope,
  normalizeError,
  successEnvelope,
  ERROR_CODES
} from "../../lib/errors.js";
import { getBearerToken, verifyToken } from "../../lib/auth.js";
import {
  getRecentReports,
  getReportById,
  canAccessReport,
  markCommentPosted
} from "../../lib/report-store.js";
import { postReviewComment, previewReviewComment } from "../../lib/comment-poster.js";
import { GITHUB_APP_INSTALL_URL } from "../../lib/github-app.js";
import { getProjectDoc, getProjectGitHubToken } from "../../lib/project-store.js";
import { buildReportUrl } from "../../lib/report-url.js";

const router = express.Router();

function optionalUser(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

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

router.get("/:id/comment-preview", async (req, res) => {
  try {
    const report = await getReportById(req.params.id);
    if (!report) {
      throw createAppError(
        ERROR_CODES.REPORT_NOT_FOUND,
        "Report not found.",
        404
      );
    }

    const user = optionalUser(req);
    if (!canAccessReport(report, user?.sub)) {
      throw createAppError(
        ERROR_CODES.FORBIDDEN,
        "You do not have access to this report.",
        403
      );
    }

    const body = previewReviewComment({
      report: report.report,
      prTitle: report.pr?.title,
      reportUrl: buildReportUrl(report.id),
      metadata: report.metadata
    });

    return res.status(200).json(successEnvelope({ body }));
  } catch (err) {
    const normalized = normalizeError(err);
    return res
      .status(normalized.status)
      .json(errorEnvelope(normalized.code, normalized.message));
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

    const user = optionalUser(req);
    if (!canAccessReport(report, user?.sub)) {
      throw createAppError(
        ERROR_CODES.FORBIDDEN,
        "You do not have access to this report.",
        403
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

router.post("/:id/comment", async (req, res) => {
  try {
    const token = getBearerToken(req);
    if (!token) {
      throw createAppError(ERROR_CODES.UNAUTHORIZED, "Authentication required.", 401);
    }

    const user = verifyToken(token);
    const report = await getReportById(req.params.id);

    if (!report) {
      throw createAppError(ERROR_CODES.REPORT_NOT_FOUND, "Report not found.", 404);
    }

    if (report.userId !== user.sub) {
      throw createAppError(ERROR_CODES.FORBIDDEN, "You do not own this report.", 403);
    }

    if (report.githubCommentUrl) {
      throw createAppError(
        ERROR_CODES.COMMENT_ALREADY_POSTED,
        "A comment has already been posted for this report.",
        409
      );
    }

    if (!report.projectId) {
      throw createAppError(
        ERROR_CODES.FORBIDDEN,
        "Comments can only be posted for project-scoped reviews.",
        403
      );
    }

    const projectDoc = await getProjectDoc(user.sub, report.projectId);
    const fallbackToken = projectDoc ? getProjectGitHubToken(projectDoc) : undefined;

    const comment = await postReviewComment({
      owner: report.owner,
      repo: report.repo,
      pullNumber: report.pullNumber,
      report: report.report,
      prTitle: report.pr?.title,
      fallbackToken,
      reportUrl: buildReportUrl(report.id),
      metadata: report.metadata
    });

    await markCommentPosted(report.id, {
      url: comment.url,
      githubCommentId: comment.id
    });

    return res.status(200).json(
      successEnvelope({
        commentUrl: comment.url,
        message: "Review comment posted to GitHub."
      })
    );
  } catch (err) {
    const normalized = normalizeError(err);
    const extra =
      normalized.code === ERROR_CODES.REPO_ACCESS_DENIED
        ? { installUrl: GITHUB_APP_INSTALL_URL }
        : {};
    return res
      .status(normalized.status)
      .json(errorEnvelope(normalized.code, normalized.message, extra));
  }
});

export default router;
