import express from "express";
import { chunkPullRequestDiff } from "../../lib/chunker.js";
import {
  createAppError,
  errorEnvelope,
  normalizeError,
  ERROR_CODES
} from "../../lib/errors.js";
import { fetchPullRequestData, parsePullRequestUrl } from "../../lib/github.js";
import { callOpenRouter } from "../../lib/openrouter.js";
import { buildPrompts } from "../../lib/prompt-builder.js";
import {
  formatAnalyzeResponse,
  parseReportWithRetry
} from "../../lib/report-formatter.js";
import { saveReport } from "../../lib/report-store.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const totalStart = Date.now();

  try {
    const { prUrl, githubToken, model } = req.body || {};

    if (!prUrl || typeof prUrl !== "string") {
      throw createAppError(
        ERROR_CODES.INVALID_PR_URL,
        "The request body must include a valid prUrl string.",
        400
      );
    }

    const parsed = parsePullRequestUrl(prUrl);

    const githubStart = Date.now();
    const prData = await fetchPullRequestData({
      owner: parsed.owner,
      repo: parsed.repo,
      pullNumber: parsed.pullNumber,
      githubToken: githubToken || undefined
    });
    console.log(`[timing] github_fetch_ms=${Date.now() - githubStart}`);

    const promptStart = Date.now();
    const diffData = chunkPullRequestDiff(prData);
    const { systemPrompt, userPrompt } = buildPrompts(prData, diffData);
    console.log(`[timing] prompt_build_ms=${Date.now() - promptStart}`);

    const llmStart = Date.now();
    const llmResponse = await callOpenRouter({
      systemPrompt,
      userPrompt,
      model
    });
    console.log(`[timing] llm_call_ms=${Date.now() - llmStart}`);

    const report = await parseReportWithRetry({
      initialText: llmResponse.text,
      strictRetry: async () => {
        const strictResponse = await callOpenRouter({
          systemPrompt,
          userPrompt: `${userPrompt}\n\nIMPORTANT: Respond with valid JSON only. Do not include markdown or extra text.`,
          model
        });
        return strictResponse.text;
      }
    });

    const responsePayload = formatAnalyzeResponse({
      prUrl,
      metadata: prData.metadata,
      report,
      model: llmResponse.model,
      filesAnalyzed: prData.files.length
    });

    try {
      await saveReport({
        prUrl,
        pr: responsePayload.pr,
        report: responsePayload.report,
        metadata: responsePayload.metadata
      });
    } catch (dbErr) {
      const msg = dbErr instanceof Error ? dbErr.message : "unknown db error";
      console.log(`[warn] report_persist_failed=${msg}`);
    }

    console.log(`[timing] total_ms=${Date.now() - totalStart}`);
    return res.status(200).json(responsePayload);
  } catch (err) {
    const normalized = normalizeError(err);
    return res
      .status(normalized.status)
      .json(errorEnvelope(normalized.code, normalized.message));
  }
});

export default router;
