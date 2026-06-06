import { chunkPullRequestDiff } from "./chunker.js";
import { fetchPullRequestData, parsePullRequestUrl } from "./github.js";
import { callOpenRouter } from "./openrouter.js";
import { buildPrompts } from "./prompt-builder.js";
import {
  formatAnalyzeResponse,
  parseReportWithRetry
} from "./report-formatter.js";
import { saveReport } from "./report-store.js";

/**
 * Analyze a GitHub pull request end-to-end.
 * @param {{
 *   prUrl: string,
 *   githubToken?: string,
 *   model?: string,
 *   userId?: string | null,
 *   projectId?: string | null,
 *   visibility?: "public" | "private",
 *   owner?: string,
 *   repo?: string,
 *   pullNumber?: number
 * }} input
 * @returns {Promise<Record<string, any>>}
 */
export async function analyzePullRequest(input) {
  const { prUrl, githubToken, model } = input;
  const parsed = parsePullRequestUrl(prUrl);
  const totalStart = Date.now();

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
    filesAnalyzed: prData.files.length,
    diffMode: diffData.mode,
    testFilesOmitted: diffData.testSummary?.length || 0
  });

  try {
    const reportId = await saveReport({
      prUrl,
      pr: responsePayload.pr,
      report: responsePayload.report,
      metadata: responsePayload.metadata,
      userId: input.userId ?? null,
      projectId: input.projectId ?? null,
      owner: input.owner || parsed.owner,
      repo: input.repo || parsed.repo,
      pullNumber: input.pullNumber ?? parsed.pullNumber,
      visibility: input.visibility || "public"
    });
    responsePayload.reportId = reportId;
  } catch (dbErr) {
    const msg = dbErr instanceof Error ? dbErr.message : "unknown db error";
    console.log(`[warn] report_persist_failed=${msg}`);
  }

  responsePayload.userId = input.userId ?? null;
  responsePayload.projectId = input.projectId ?? null;
  responsePayload.visibility = input.visibility || "public";

  console.log(`[timing] total_ms=${Date.now() - totalStart}`);
  return responsePayload;
}
