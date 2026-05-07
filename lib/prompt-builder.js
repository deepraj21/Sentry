const SYSTEM_PROMPT = `You are Sentry, an expert AI code reviewer. You analyze GitHub Pull Requests and produce a detailed, actionable review. You are thorough but fair — you flag real issues, not style nitpicks. You consider code quality, potential bugs, security concerns, performance, test coverage, and whether the PR achieves what it claims.

Respond ONLY with a valid JSON object matching the exact schema below. No markdown, no preamble, no explanation outside the JSON.`;

/**
 * Build system and user prompts from PR context.
 * @param {{
 *   metadata: any,
 *   commits: any[],
 *   reviewComments: any[],
 *   conversation: any[],
 *   reviews: any[]
 * }} prData
 * @param {{
 *   mode: "full" | "chunked",
 *   files: Array<{filename: string, status: string, additions: number, deletions: number, patch: string}>,
 *   testSummary: Array<{filename: string, additions: number, deletions: number}>,
 *   allFilenames: string[],
 *   estimatedTokens: number
 * }} diffData
 * @returns {{systemPrompt: string, userPrompt: string}}
 */
export function buildPrompts(prData, diffData) {
  const metadata = prData.metadata || {};

  const commits = (prData.commits || [])
    .map((c, i) => {
      const shortSha = (c.sha || "").slice(0, 7);
      return `${i + 1}. ${shortSha} — ${c.message} (by ${c.author})`;
    })
    .join("\n");

  const fileChanges = (diffData.files || [])
    .map(
      (f) =>
        `### ${f.filename} (status: ${f.status}, +${f.additions} -${f.deletions})\n${f.patch}`
    )
    .join("\n\n");

  const existingReviews = (prData.reviews || [])
    .map((r) => `- @${r.user}: ${r.state} — "${r.body || "No comment"}"`)
    .join("\n");

  const inlineComments = (prData.reviewComments || [])
    .map(
      (c) =>
        `- @${c.user} on ${c.path || "unknown-file"} line ${c.line || "?"}: "${c.body}"`
    )
    .join("\n");

  const conversation = (prData.conversation || [])
    .map((c) => `- @${c.user}: "${c.body}"`)
    .join("\n");

  const testSummary =
    diffData.mode === "chunked" && diffData.testSummary.length > 0
      ? `\n\n## Test Files Summary (content omitted for size)\n${diffData.testSummary
          .map((t) => `- ${t.filename} (+${t.additions} -${t.deletions})`)
          .join("\n")}`
      : "";

  const userPrompt = `## PR Metadata
Title: ${metadata.title || "Unknown"}
Author: ${metadata.author || "Unknown"}
Description: ${metadata.description || ""}
Base ← Head: ${metadata.baseBranch || "unknown"} ← ${metadata.headBranch || "unknown"}
Labels: ${JSON.stringify(metadata.labels || [])}
Changed files: ${metadata.changedFiles || 0} (additions: +${metadata.additions || 0}, deletions: -${
    metadata.deletions || 0
  })
Diff mode: ${diffData.mode}
Estimated tokens in diff context: ${diffData.estimatedTokens}
All filenames: ${diffData.allFilenames.join(", ")}

## Commits
${commits || "None"}

## File Changes
${fileChanges || "No file patches available"}${testSummary}

## Existing Reviews
${existingReviews || "None"}

## Review Comments (inline)
${inlineComments || "None"}

## Conversation
${conversation || "None"}

Expected JSON output schema (follow exactly):
{
  "verdict": "APPROVE" | "REQUEST_CHANGES" | "NEEDS_DISCUSSION",
  "confidence": 0.0-1.0,
  "summary": "2-3 sentence overall assessment",
  "risks": [
    {
      "severity": "critical" | "major" | "minor",
      "file": "path/to/file.js",
      "line": 42,
      "description": "What the issue is",
      "suggestion": "How to fix it"
    }
  ],
  "strengths": ["list of things done well"],
  "missingTests": ["areas that lack test coverage"],
  "securityConcerns": ["any security issues found"],
  "performanceNotes": ["any performance observations"],
  "unresolvedDiscussions": ["conversations that seem unresolved"],
  "mergeReadiness": {
    "ready": true | false,
    "blockers": ["list of things that must be fixed before merge"],
    "suggestions": ["list of nice-to-haves"]
  }
}`;

  return { systemPrompt: SYSTEM_PROMPT, userPrompt };
}
