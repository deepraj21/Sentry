/**
 * Format a structured report as a GitHub PR comment markdown body.
 * @param {Record<string, any>} report
 * @param {Record<string, any>} [options]
 * @returns {string}
 */
export function formatReportAsGitHubComment(report, options = {}) {
  const verdict = String(report?.verdict || "NEEDS_DISCUSSION").replaceAll("_", " ");
  const confidencePct =
    typeof report?.confidence === "number"
      ? Math.round(report.confidence * 100)
      : null;
  const confidenceLabel = confidenceQualitative(confidencePct);
  const confidence =
    confidencePct !== null ? `${confidencePct}% (${confidenceLabel})` : "—";

  const risks = report?.risks || [];
  const p0 = risks.filter(
    (r) => r.severity === "critical" || (r.label === "issue" && r.blocking)
  );
  const p0Set = new Set(p0);
  const p1 = risks.filter(
    (r) => !p0Set.has(r) && (r.severity === "major" || r.label === "suggestion")
  );
  const shownSet = new Set([...p0, ...p1]);
  const p2 = risks.filter(
    (r) => !shownSet.has(r) && (r.severity === "minor" || r.label === "nitpick")
  );

  const blockerCount = p0.length;
  const mergeReady = report?.mergeReadiness?.ready === true;
  const mergeReadyText = mergeReady
    ? "Yes"
    : blockerCount > 0
      ? `No — ${blockerCount} blocker${blockerCount === 1 ? "" : "s"}`
      : "No";

  const filesAnalyzed = options.filesAnalyzed ?? "—";
  const totalChanges = options.totalChanges || "—";
  const diffMode = options.diffMode || "full";
  const scopeNote = diffMode === "chunked" ? "chunked diff" : "full diff";

  const executiveSummary =
    report?.executiveSummary || report?.summary || "No summary available.";

  let itemIndex = 0;
  const sections = [];

  if (p0.length > 0) {
    sections.push("### Must fix before merge (P0)");
    sections.push(
      p0.map((risk) => formatFinding(risk, ++itemIndex, { truncate: false })).join("\n\n")
    );
  }

  if (p1.length > 0) {
    sections.push("### Should fix (P1)");
    sections.push(
      p1.map((risk) => formatFinding(risk, ++itemIndex, { truncate: false })).join("\n\n")
    );
  }

  if (p2.length > 0) {
    sections.push("### Nitpicks (P2, non-blocking)");
    sections.push(
      p2.map((risk) => formatFinding(risk, ++itemIndex, { truncate: true })).join("\n\n")
    );
  }

  if (p0.length === 0 && p1.length === 0 && p2.length === 0) {
    sections.push("### Findings");
    sections.push("_No significant issues identified._");
  }

  const praise = formatPraise(report?.strengths);
  const openThreads = formatOpenThreads(
    report?.unresolvedDiscussions,
    report?.priorReviewNotes
  );
  const gaps = formatGaps(report);
  const affectedFiles = formatAffectedFiles(risks);
  const coverageNote =
    diffMode === "chunked"
      ? formatCoverageNote(options.testFilesOmitted)
      : "";

  let body = `## Sentry Review

| | |
| --- | --- |
| **Verdict** | ${verdict} |
| **Confidence** | ${confidence} |
| **Merge ready** | ${mergeReadyText} |
| **Scope** | ${filesAnalyzed} files · ${totalChanges} · ${scopeNote} |

**TL;DR:** ${executiveSummary}

${sections.join("\n\n")}

### praise: What looks good
${praise}`;

  if (openThreads) {
    body += `\n\n### Open threads\n${openThreads}`;
  }

  if (gaps) {
    body += `\n\n### Test & security gaps\n${gaps}`;
  }

  if (affectedFiles) {
    body += `\n\n<details>\n<summary>Affected files (${countAffectedFiles(risks)})</summary>\n\n${affectedFiles}\n</details>`;
  }

  if (coverageNote) {
    body += `\n\n### Coverage note\n${coverageNote}`;
  }

  const footerParts = ["Analyzed by Sentry"];
  if (options.model) footerParts.push(options.model);
  if (options.analyzedAt) footerParts.push(options.analyzedAt);
  if (options.reportUrl) {
    footerParts.push(`[View full report](${options.reportUrl})`);
  }

  body += `\n\n---\n${footerParts.join(" · ")}`;

  const maxLength = 60000;
  if (body.length > maxLength) {
    body = `${body.slice(0, maxLength - 80)}\n\n_(Comment truncated due to GitHub length limits.)_`;
  }

  return body;
}

/**
 * @param {Record<string, any>} risk
 * @param {number} index
 * @param {{ truncate?: boolean }} opts
 */
function formatFinding(risk, index, opts = {}) {
  const label = risk.label || "suggestion";
  const blocking = risk.blocking ? "blocking" : "non-blocking";
  const category = risk.category ? `, ${risk.category}` : "";
  const location = formatLocation(risk);
  const labelPrefix =
    label === "issue"
      ? `**issue (${blocking}${category}):**`
      : label === "nitpick"
        ? `**nitpick (non-blocking${category}):**`
        : `**suggestion${category ? ` (${risk.category})` : ""}:**`;

  const truncate = opts.truncate === true;
  const maxLen = truncate ? 500 : 4000;

  let block = `${index}. ${labelPrefix} ${location}\n`;
  block += `   - **What:** ${clamp(risk.description, maxLen)}\n`;

  if (risk.impact) {
    block += `   - **Why:** ${clamp(risk.impact, maxLen)}\n`;
  }

  block += `   - **Fix:** ${clamp(risk.suggestion, maxLen)}`;

  if (risk.codeSnippet && (risk.blocking || risk.severity === "critical")) {
    block += `\n   \`\`\`diff\n${risk.codeSnippet}\n   \`\`\``;
  }

  if (risk.agentPrompt && (risk.blocking || risk.severity === "critical")) {
    block += `\n   - **Agent prompt:** ${clamp(risk.agentPrompt, maxLen)}`;
  }

  return block;
}

/**
 * @param {Record<string, any>} risk
 */
function formatLocation(risk) {
  const file = risk.file || "unknown file";
  const line = risk.line != null ? `:${risk.line}` : "";
  return `\`${file}${line}\``;
}

/**
 * @param {string[] | undefined} strengths
 */
function formatPraise(strengths) {
  if (!Array.isArray(strengths) || strengths.length === 0) {
    return "- _No specific praise noted._";
  }
  return strengths.map((s) => `- ${String(s)}`).join("\n");
}

/**
 * @param {string[] | undefined} unresolved
 * @param {string[] | undefined} priorNotes
 */
function formatOpenThreads(unresolved, priorNotes) {
  const items = [
    ...(Array.isArray(unresolved) ? unresolved : []),
    ...(Array.isArray(priorNotes) ? priorNotes : [])
  ];
  if (items.length === 0) return "";
  return items.map((item) => `- ${String(item)}`).join("\n");
}

/**
 * @param {Record<string, any>} report
 */
function formatGaps(report) {
  const parts = [];
  if (Array.isArray(report?.securityConcerns) && report.securityConcerns.length > 0) {
    parts.push(
      `**Security:**\n${report.securityConcerns.map((s) => `- ${s}`).join("\n")}`
    );
  }
  if (Array.isArray(report?.missingTests) && report.missingTests.length > 0) {
    parts.push(
      `**Missing tests:**\n${report.missingTests.map((s) => `- ${s}`).join("\n")}`
    );
  }
  if (Array.isArray(report?.performanceNotes) && report.performanceNotes.length > 0) {
    parts.push(
      `**Performance:**\n${report.performanceNotes.map((s) => `- ${s}`).join("\n")}`
    );
  }
  return parts.join("\n\n");
}

/**
 * @param {Array<Record<string, any>>} risks
 */
function formatAffectedFiles(risks) {
  const files = new Map();
  for (const risk of risks) {
    if (risk?.file && !files.has(risk.file)) {
      files.set(risk.file, risk.description || "Flagged in review");
    }
  }
  if (files.size === 0) return "";
  return [...files.entries()]
    .map(([file, reason]) => `- \`${file}\` — ${clamp(reason, 200)}`)
    .join("\n");
}

/**
 * @param {Array<Record<string, any>>} risks
 */
function countAffectedFiles(risks) {
  return new Set(risks.map((r) => r.file).filter(Boolean)).size;
}

/**
 * @param {number | undefined} testFilesOmitted
 */
function formatCoverageNote(testFilesOmitted) {
  const testNote =
    typeof testFilesOmitted === "number" && testFilesOmitted > 0
      ? ` ${testFilesOmitted} test file(s) summarized by name only.`
      : "";
  return `_Analysis used chunked diff mode; some patches may be truncated.${testNote} Re-run on smaller PRs for deeper test review._`;
}

/**
 * @param {number | null} pct
 */
function confidenceQualitative(pct) {
  if (pct === null) return "Unknown";
  if (pct >= 85) return "High";
  if (pct >= 65) return "Moderate";
  if (pct >= 40) return "Low";
  return "Very low";
}

/**
 * @param {string} text
 * @param {number} max
 */
function clamp(text, max) {
  const value = String(text || "").replace(/\n/g, " ").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}
