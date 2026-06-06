import { formatReportAsGitHubComment } from "./comment-formatter.js";
import { postPullRequestComment } from "./github.js";
import { resolveCommentPostingToken } from "./github-app.js";

/**
 * Build formatter options from report metadata.
 * @param {Record<string, any>} [metadata]
 * @param {string} [reportUrl]
 * @returns {Record<string, any>}
 */
export function buildCommentFormatOptions(metadata = {}, reportUrl) {
  return {
    reportUrl,
    model: metadata.model,
    analyzedAt: metadata.analyzedAt,
    filesAnalyzed: metadata.filesAnalyzed,
    totalChanges: metadata.totalChanges,
    diffMode: metadata.diffMode || "full",
    testFilesOmitted: metadata.testFilesOmitted || 0
  };
}

/**
 * Post a formatted review comment on a pull request.
 * @param {{
 *   owner: string,
 *   repo: string,
 *   pullNumber: number,
 *   report: Record<string, any>,
 *   prTitle?: string,
 *   fallbackToken?: string,
 *   reportUrl?: string,
 *   metadata?: Record<string, any>
 * }} input
 * @returns {Promise<{ url: string, id: number }>}
 */
export async function postReviewComment(input) {
  const githubToken = await resolveCommentPostingToken({
    owner: input.owner,
    repo: input.repo,
    fallbackToken: input.fallbackToken
  });

  const body = formatReportAsGitHubComment(input.report, {
    prTitle: input.prTitle,
    ...buildCommentFormatOptions(input.metadata, input.reportUrl)
  });

  return postPullRequestComment({
    owner: input.owner,
    repo: input.repo,
    pullNumber: input.pullNumber,
    body,
    githubToken
  });
}

/**
 * Preview the formatted comment body without posting.
 * @param {{
 *   report: Record<string, any>,
 *   prTitle?: string,
 *   reportUrl?: string,
 *   metadata?: Record<string, any>
 * }} input
 * @returns {string}
 */
export function previewReviewComment(input) {
  return formatReportAsGitHubComment(input.report, {
    prTitle: input.prTitle,
    ...buildCommentFormatOptions(input.metadata, input.reportUrl)
  });
}
