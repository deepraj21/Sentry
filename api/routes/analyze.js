import express from "express";
import {
  createAppError,
  errorEnvelope,
  normalizeError,
  ERROR_CODES
} from "../../lib/errors.js";
import { analyzePullRequest } from "../../lib/analyze-pr.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { prUrl, githubToken, model } = req.body || {};

    if (!prUrl || typeof prUrl !== "string") {
      throw createAppError(
        ERROR_CODES.INVALID_PR_URL,
        "The request body must include a valid prUrl string.",
        400
      );
    }

    const responsePayload = await analyzePullRequest({
      prUrl,
      githubToken: githubToken || undefined,
      model,
      userId: null,
      projectId: null,
      visibility: "public"
    });

    return res.status(200).json(responsePayload);
  } catch (err) {
    const normalized = normalizeError(err);
    return res
      .status(normalized.status)
      .json(errorEnvelope(normalized.code, normalized.message));
  }
});

export default router;
