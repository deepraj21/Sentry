import { createAppError, ERROR_CODES, successEnvelope } from "./errors.js";

const VALID_VERDICTS = new Set(["APPROVE", "REQUEST_CHANGES", "NEEDS_DISCUSSION"]);
const VALID_SEVERITIES = new Set(["critical", "major", "minor"]);
const VALID_LABELS = new Set(["issue", "suggestion", "nitpick"]);
const VALID_CATEGORIES = new Set([
  "security",
  "correctness",
  "performance",
  "testing",
  "maintainability"
]);

const SEVERITY_RANK = { critical: 0, major: 1, minor: 2 };

/**
 * Safely parse model JSON output.
 * @param {string} text
 * @returns {any}
 */
function parseJson(text) {
  return JSON.parse(text);
}

/**
 * Validate a single risk object has required fields.
 * @param {any} risk
 * @returns {boolean}
 */
function isValidRisk(risk) {
  if (!risk || typeof risk !== "object") return false;
  return (
    typeof risk.description === "string" &&
    risk.description.trim().length > 0 &&
    typeof risk.suggestion === "string" &&
    risk.suggestion.trim().length > 0
  );
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

  if (
    typeof report.verdict !== "string" ||
    typeof report.confidence !== "number" ||
    typeof report.summary !== "string" ||
    !Array.isArray(report.risks) ||
    !report.mergeReadiness ||
    typeof report.mergeReadiness !== "object"
  ) {
    return false;
  }

  return report.risks.every(isValidRisk);
}

/**
 * Derive Conventional Comments label from severity.
 * @param {string} severity
 * @returns {"issue" | "suggestion" | "nitpick"}
 */
function labelFromSeverity(severity) {
  const normalized = String(severity || "minor").toLowerCase();
  if (normalized === "critical") return "issue";
  if (normalized === "major") return "suggestion";
  return "nitpick";
}

/**
 * Normalize a single risk entry for consistent rendering.
 * @param {any} risk
 * @returns {Record<string, any> | null}
 */
function normalizeRisk(risk) {
  if (!isValidRisk(risk)) return null;

  const severity = VALID_SEVERITIES.has(String(risk.severity || "").toLowerCase())
    ? String(risk.severity).toLowerCase()
    : "minor";

  const label = VALID_LABELS.has(String(risk.label || "").toLowerCase())
    ? String(risk.label).toLowerCase()
    : labelFromSeverity(severity);

  const blocking =
    typeof risk.blocking === "boolean"
      ? risk.blocking
      : severity === "critical" || label === "issue";

  const category = VALID_CATEGORIES.has(String(risk.category || "").toLowerCase())
    ? String(risk.category).toLowerCase()
    : "maintainability";

  return {
    severity,
    label,
    blocking,
    category,
    file: typeof risk.file === "string" ? risk.file : "",
    line: typeof risk.line === "number" ? risk.line : null,
    description: String(risk.description).trim(),
    impact: typeof risk.impact === "string" ? risk.impact.trim() : "",
    suggestion: String(risk.suggestion).trim(),
    codeSnippet:
      typeof risk.codeSnippet === "string" ? risk.codeSnippet.trim() : "",
    agentPrompt:
      typeof risk.agentPrompt === "string" ? risk.agentPrompt.trim() : ""
  };
}

/**
 * Normalize and enrich a parsed LLM report.
 * @param {any} report
 * @returns {Record<string, any>}
 */
export function normalizeReport(report) {
  const verdict = VALID_VERDICTS.has(report.verdict)
    ? report.verdict
    : "NEEDS_DISCUSSION";

  const confidence =
    typeof report.confidence === "number"
      ? Math.min(1, Math.max(0, report.confidence))
      : 0.5;

  const summary = String(report.summary || "").trim() || "No summary available.";

  const executiveSummary =
    typeof report.executiveSummary === "string" && report.executiveSummary.trim()
      ? report.executiveSummary.trim()
      : summary.split(/[.!?]/)[0]?.trim() || summary;

  const normalizedRisks = (report.risks || [])
    .map(normalizeRisk)
    .filter(Boolean)
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3));

  const p0 = normalizedRisks.filter(
    (r) => r.severity === "critical" || (r.label === "issue" && r.blocking)
  );
  const p0Set = new Set(p0);
  const p1 = normalizedRisks.filter(
    (r) =>
      !p0Set.has(r) && (r.severity === "major" || r.label === "suggestion")
  );
  const shownSet = new Set([...p0, ...p1]);
  const p2 = normalizedRisks
    .filter(
      (r) =>
        !shownSet.has(r) && (r.severity === "minor" || r.label === "nitpick")
    )
    .slice(0, 3);

  const cappedRisks = [...p0, ...p1, ...p2];

  const mergeReadiness = report.mergeReadiness || {};

  return {
    ...report,
    verdict,
    confidence,
    executiveSummary,
    summary,
    risks: cappedRisks,
    strengths: Array.isArray(report.strengths) ? report.strengths : [],
    missingTests: Array.isArray(report.missingTests) ? report.missingTests : [],
    securityConcerns: Array.isArray(report.securityConcerns)
      ? report.securityConcerns
      : [],
    performanceNotes: Array.isArray(report.performanceNotes)
      ? report.performanceNotes
      : [],
    actionItems: Array.isArray(report.actionItems) ? report.actionItems : [],
    priorReviewNotes: Array.isArray(report.priorReviewNotes)
      ? report.priorReviewNotes
      : [],
    unresolvedDiscussions: Array.isArray(report.unresolvedDiscussions)
      ? report.unresolvedDiscussions
      : [],
    mergeReadiness: {
      ready: mergeReadiness.ready === true,
      blockers: Array.isArray(mergeReadiness.blockers) ? mergeReadiness.blockers : [],
      suggestions: Array.isArray(mergeReadiness.suggestions)
        ? mergeReadiness.suggestions
        : []
    }
  };
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
      return normalizeReport(report);
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
    return normalizeReport(retryReport);
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
 *   filesAnalyzed: number,
 *   diffMode?: "full" | "chunked",
 *   testFilesOmitted?: number
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
      additions: input.metadata?.additions || 0,
      deletions: input.metadata?.deletions || 0,
      diffMode: input.diffMode || "full",
      testFilesOmitted: input.testFilesOmitted || 0,
      analyzedAt: new Date().toISOString()
    }
  });
}
