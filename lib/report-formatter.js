import { createAppError, ERROR_CODES, successEnvelope } from "./errors.js";

/**
 * Safely parse model JSON output.
 * @param {string} text
 * @returns {any}
 */
function parseJson(text) {
  return JSON.parse(text);
}

/**
 * Validate minimal top-level report structure.
 * @param {any} report
 * @returns {boolean}
 */
function isValidReport(report) {
  if (!report || typeof report !== "object") {
    return false;
  }
  return (
    typeof report.verdict === "string" &&
    typeof report.confidence === "number" &&
    typeof report.summary === "string" &&
    Array.isArray(report.risks) &&
    report.mergeReadiness &&
    typeof report.mergeReadiness === "object"
  );
}

/**
 * Parse and validate the LLM response with one retry callback.
 * @param {{initialText: string, strictRetry: () => Promise<string>}} input
 * @returns {Promise<any>}
 */
export async function parseReportWithRetry(input) {
  try {
    const report = parseJson(input.initialText);
    if (isValidReport(report)) {
      return report;
    }
  } catch {
    // Retry below.
  }

  const retryText = await input.strictRetry();
  try {
    const retryReport = parseJson(retryText);
    if (!isValidReport(retryReport)) {
      throw new Error("Schema validation failed");
    }
    return retryReport;
  } catch {
    throw createAppError(
      ERROR_CODES.LLM_PARSE_ERROR,
      "LLM response could not be parsed as valid JSON after retry.",
      502
    );
  }
}

/**
 * Build final API response envelope.
 * @param {{
 *   prUrl: string,
 *   metadata: any,
 *   report: any,
 *   model: string,
 *   filesAnalyzed: number
 * }} input
 * @returns {Record<string, any>}
 */
export function formatAnalyzeResponse(input) {
  return successEnvelope({
    pr: {
      url: input.prUrl,
      title: input.metadata?.title || "",
      author: input.metadata?.author || ""
    },
    report: input.report,
    metadata: {
      model: input.model,
      filesAnalyzed: input.filesAnalyzed,
      totalChanges: `+${input.metadata?.additions || 0} -${input.metadata?.deletions || 0}`,
      analyzedAt: new Date().toISOString()
    }
  });
}
