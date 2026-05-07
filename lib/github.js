import { createAppError, ERROR_CODES, isGitHubRateLimit } from "./errors.js";

const PR_URL_REGEX =
  /^https:\/\/github\.com\/(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+)\/pull\/(?<pullNumber>\d+)(?:\/.*)?$/i;

/**
 * Parse and validate a GitHub PR URL.
 * @param {string} prUrl
 * @returns {{owner: string, repo: string, pullNumber: number}}
 */
export function parsePullRequestUrl(prUrl) {
  const normalized = String(prUrl || "").trim();
  const match = normalized.match(PR_URL_REGEX);

  if (!match?.groups) {
    throw createAppError(
      ERROR_CODES.INVALID_PR_URL,
      "Invalid GitHub pull request URL format. Expected: https://github.com/{owner}/{repo}/pull/{number}",
      400
    );
  }

  const owner = match.groups.owner;
  const repo = match.groups.repo;
  const pullNumber = Number(match.groups.pullNumber);

  if (!owner || !repo || !Number.isInteger(pullNumber) || pullNumber <= 0) {
    throw createAppError(
      ERROR_CODES.INVALID_PR_URL,
      "Invalid GitHub pull request URL format.",
      400
    );
  }

  return { owner, repo, pullNumber };
}

/**
 * Fetch one GitHub API endpoint and return JSON.
 * @param {string} url
 * @param {string | undefined} githubToken
 * @returns {Promise<Response>}
 */
async function githubFetch(url, githubToken) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "sentry-pr-reviewer"
  };

  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`;
  }

  return fetch(url, { headers });
}

/**
 * Handle a failed GitHub response.
 * @param {Response} response
 * @returns {Promise<never>}
 */
async function throwGitHubError(response) {
  const bodyText = await response.text();

  if (response.status === 404) {
    throw createAppError(
      ERROR_CODES.PR_NOT_FOUND,
      "Pull request not found. Verify the URL and repository visibility.",
      404
    );
  }

  if (isGitHubRateLimit(response.status, response.headers, bodyText)) {
    throw createAppError(
      ERROR_CODES.GITHUB_RATE_LIMITED,
      "GitHub API rate limit exceeded. Please provide a GitHub token for higher limits.",
      429
    );
  }

  throw createAppError(
    ERROR_CODES.GITHUB_API_ERROR,
    `GitHub API request failed with status ${response.status}.`,
    response.status >= 400 && response.status < 600 ? response.status : 502
  );
}

/**
 * Fetch a paginated GitHub API list endpoint.
 * @template T
 * @param {string} url
 * @param {string | undefined} githubToken
 * @returns {Promise<T[]>}
 */
async function fetchPaginated(url, githubToken) {
  /** @type {T[]} */
  const items = [];
  let page = 1;

  while (true) {
    const pagedUrl = new URL(url);
    pagedUrl.searchParams.set("per_page", "100");
    pagedUrl.searchParams.set("page", String(page));

    const response = await githubFetch(pagedUrl.toString(), githubToken);
    if (!response.ok) {
      await throwGitHubError(response);
    }

    /** @type {T[]} */
    const chunk = await response.json();
    items.push(...chunk);

    if (chunk.length < 100) {
      break;
    }

    page += 1;
  }

  return items;
}

/**
 * Fetch all required PR context from GitHub.
 * @param {{owner: string, repo: string, pullNumber: number, githubToken?: string}} input
 * @returns {Promise<{
 *   metadata: any,
 *   files: any[],
 *   commits: any[],
 *   reviewComments: any[],
 *   conversation: any[],
 *   reviews: any[]
 * }>}
 */
export async function fetchPullRequestData(input) {
  const { owner, repo, pullNumber } = input;
  const githubToken = input.githubToken || process.env.GITHUB_TOKEN;
  const baseUrl = `https://api.github.com/repos/${owner}/${repo}`;

  const metadataRes = await githubFetch(
    `${baseUrl}/pulls/${pullNumber}`,
    githubToken
  );
  if (!metadataRes.ok) {
    await throwGitHubError(metadataRes);
  }
  const metadata = await metadataRes.json();

  const [files, commits, reviewComments, conversation, reviews] =
    await Promise.all([
      fetchPaginated(`${baseUrl}/pulls/${pullNumber}/files`, githubToken),
      fetchPaginated(`${baseUrl}/pulls/${pullNumber}/commits`, githubToken),
      fetchPaginated(`${baseUrl}/pulls/${pullNumber}/comments`, githubToken),
      fetchPaginated(`${baseUrl}/issues/${pullNumber}/comments`, githubToken),
      fetchPaginated(`${baseUrl}/pulls/${pullNumber}/reviews`, githubToken)
    ]);

  return {
    metadata: {
      url: metadata.html_url,
      title: metadata.title,
      description: metadata.body || "",
      author: metadata.user?.login || "unknown",
      baseBranch: metadata.base?.ref,
      headBranch: metadata.head?.ref,
      state: metadata.state,
      createdAt: metadata.created_at,
      labels: (metadata.labels || []).map((label) => label?.name).filter(Boolean),
      mergeable: metadata.mergeable,
      additions: metadata.additions || 0,
      deletions: metadata.deletions || 0,
      changedFiles: metadata.changed_files || 0
    },
    files: (files || []).map((file) => ({
      filename: file.filename,
      status: file.status,
      patch: file.patch || "",
      additions: file.additions || 0,
      deletions: file.deletions || 0,
      changes: file.changes || 0,
      previousFilename: file.previous_filename || null
    })),
    commits: (commits || []).map((commit) => ({
      sha: commit.sha,
      message: commit.commit?.message || "",
      author: commit.commit?.author?.name || commit.author?.login || "unknown",
      timestamp: commit.commit?.author?.date || null
    })),
    reviewComments: (reviewComments || []).map((comment) => ({
      user: comment.user?.login || "unknown",
      body: comment.body || "",
      path: comment.path || null,
      line: comment.line || comment.original_line || null,
      createdAt: comment.created_at || null
    })),
    conversation: (conversation || []).map((comment) => ({
      user: comment.user?.login || "unknown",
      body: comment.body || "",
      createdAt: comment.created_at || null
    })),
    reviews: (reviews || []).map((review) => ({
      user: review.user?.login || "unknown",
      state: review.state || "COMMENTED",
      body: review.body || "",
      submittedAt: review.submitted_at || null
    }))
  };
}
