const SYSTEM_PROMPT = `You are Sentry, a senior staff engineer writing Conventional Comments-style pull request reviews that entire teams can act on. You analyze GitHub Pull Requests and produce detailed, actionable feedback.

Review rules:
- Every finding must answer what (the problem), why (the impact), and how (concrete fix) — never vague feedback like "this feels wrong"
- Use severity labels: "issue" with blocking=true for P0/critical, "suggestion" for P1/major, "nitpick" for P2/minor
- Prioritize blockers (security, correctness, data loss) over style; omit lintable style nits entirely
- Do NOT repeat findings already raised in existing inline reviews or submitted reviews unless still unresolved
- Include at least one praise item in strengths when the code warrants it
- Limit nitpick/minor risks to at most 3; omit cosmetic issues
- Reference only file paths that appear in the provided diff
- For each blocking issue, include a one-line agentPrompt suitable for copy-paste into AI codegen tools
- When diff is chunked or truncated, note uncertainty in summary, lower confidence, and mention limited test file coverage

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
 *   files: Array<{filename: string, status: string, additions: number, deletions: number, patch: string, truncated?: boolean}>,
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
    .map((f) => {
      const truncatedNote = f.truncated ? " [patch truncated]" : "";
      return `### ${f.filename} (status: ${f.status}, +${f.additions} -${f.deletions})${truncatedNote}\n${f.patch}`;
    })
    .join("\n\n");

  const truncatedFiles = (diffData.files || [])
    .filter((f) => f.truncated)
    .map((f) => f.filename);

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

  const mergeableNote =
    metadata.mergeable === false
      ? "no (merge conflicts detected)"
      : metadata.mergeable === true
        ? "yes"
        : "unknown";

  const diffCoverageNote =
    diffData.mode === "chunked"
      ? `Chunked mode: non-test patches may be truncated; ${diffData.testSummary.length} test file(s) summarized by name only. Truncated files: ${truncatedFiles.join(", ") || "none"}.`
      : "Full diff available.";

  const userPrompt = `## PR Metadata
Title: ${metadata.title || "Unknown"}
Author: ${metadata.author || "Unknown"}
Description: ${metadata.description || ""}
Base ← Head: ${metadata.baseBranch || "unknown"} ← ${metadata.headBranch || "unknown"}
Labels: ${JSON.stringify(metadata.labels || [])}
Mergeable: ${mergeableNote}
Changed files: ${metadata.changedFiles || 0} (additions: +${metadata.additions || 0}, deletions: -${
    metadata.deletions || 0
  })
Diff mode: ${diffData.mode}
Diff coverage: ${diffCoverageNote}
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

Do not duplicate feedback already covered in Existing Reviews or Review Comments unless the thread appears unresolved.

Expected JSON output schema (follow exactly):
{
  "verdict": "APPROVE" | "REQUEST_CHANGES" | "NEEDS_DISCUSSION",
  "confidence": 0.0-1.0,
  "executiveSummary": "1 sentence TL;DR for team leads",
  "summary": "2-3 sentence overall assessment",
  "risks": [
    {
      "severity": "critical" | "major" | "minor",
      "label": "issue" | "suggestion" | "nitpick",
      "blocking": true | false,
      "category": "security" | "correctness" | "performance" | "testing" | "maintainability",
      "file": "path/to/file.js",
      "line": 42,
      "description": "What is wrong",
      "impact": "Why it matters",
      "suggestion": "How to fix it",
      "codeSnippet": "optional diff-ready fix as - old line\\n+ new line",
      "agentPrompt": "One-line instruction for AI/codegen tools (required for blocking issues)"
    }
  ],
  "actionItems": [
    {
      "priority": "must_fix" | "should_fix" | "nice_to_have",
      "text": "action description",
      "owner": "author" | "reviewer" | "team"
    }
  ],
  "strengths": ["praise-worthy things done well"],
  "missingTests": ["areas that lack test coverage"],
  "securityConcerns": ["any security issues found"],
  "performanceNotes": ["any performance observations"],
  "priorReviewNotes": ["existing feedback we agree/disagree with and why"],
  "unresolvedDiscussions": ["conversations that seem unresolved"],
  "mergeReadiness": {
    "ready": true | false,
    "blockers": ["list of things that must be fixed before merge"],
    "suggestions": ["list of nice-to-haves"]
  }
}`;

  return { systemPrompt: SYSTEM_PROMPT, userPrompt };
}
