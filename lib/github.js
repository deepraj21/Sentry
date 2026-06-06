import { createAppError, ERROR_CODES, isGitHubRateLimit } from "./errors.js";

const PR_URL_REGEX =
  /^https:\/\/github\.com\/(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+)\/pull\/(?<pullNumber>\d+)(?:\/.*)?$/i;

const REPO_URL_REGEX =
  /^https:\/\/github\.com\/(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+)\/?(?:\/.*)?$/i;

const REPO_SLUG_REGEX = /^(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+)$/;

/**
 * Parse and validate a GitHub repository URL or owner/repo slug.
 * @param {string} repoUrl
 * @returns {{owner: string, repo: string}}
 */
export function parseRepoUrl(repoUrl) {
  const normalized = String(repoUrl || "").trim();

  let match = normalized.match(REPO_URL_REGEX);
  if (!match?.groups) {
    match = normalized.match(REPO_SLUG_REGEX);
  }

  if (!match?.groups) {
    throw createAppError(
      ERROR_CODES.INVALID_REPO_URL,
      "Invalid GitHub repository URL. Expected: https://github.com/{owner}/{repo}",
      400
    );
  }

  const owner = match.groups.owner;
  const repo = match.groups.repo.replace(/\.git$/i, "");

  if (!owner || !repo) {
    throw createAppError(ERROR_CODES.INVALID_REPO_URL, "Invalid GitHub repository URL.", 400);
  }

  return { owner, repo };
}

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
 * Fetch one GitHub API endpoint.
 * @param {string} url
 * @param {string | undefined} githubToken
 * @param {{ method?: string, body?: Record<string, any> }} [options]
 * @returns {Promise<Response>}
 */
async function githubFetch(url, githubToken, options = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "sentry-pr-reviewer"
  };

  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`;
  }

  const init = { method: options.method || "GET", headers };
  if (options.body) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  return fetch(url, init);
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

  if (response.status === 401 || response.status === 403) {
    throw createAppError(
      ERROR_CODES.REPO_ACCESS_DENIED,
      "GitHub access denied. Provide a valid token with repository access.",
      response.status
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

/**
 * Verify repository access and return metadata.
 * @param {{owner: string, repo: string, githubToken?: string}} input
 * @returns {Promise<{ owner: string, repo: string, fullName: string, isPrivate: boolean, defaultBranch: string, description: string }>}
 */
export async function verifyRepository(input) {
  const { owner, repo } = input;
  const githubToken = input.githubToken || process.env.GITHUB_TOKEN;
  const url = `https://api.github.com/repos/${owner}/${repo}`;
  const response = await githubFetch(url, githubToken);

  if (response.status === 404) {
    throw createAppError(
      ERROR_CODES.REPO_NOT_FOUND,
      "Repository not found. If it is private, provide a GitHub token with repo access.",
      404
    );
  }

  if (!response.ok) {
    await throwGitHubError(response);
  }

  const data = await response.json();
  return {
    owner: data.owner?.login || owner,
    repo: data.name || repo,
    fullName: data.full_name || `${owner}/${repo}`,
    isPrivate: Boolean(data.private),
    defaultBranch: data.default_branch || "main",
    description: data.description || ""
  };
}

/**
 * List open pull requests for a repository.
 * @param {{owner: string, repo: string, githubToken?: string}} input
 * @returns {Promise<Array<{ number: number, title: string, author: string, url: string, updatedAt: string, draft: boolean }>>}
 */
export async function listOpenPullRequests(input) {
  const { owner, repo } = input;
  const githubToken = input.githubToken || process.env.GITHUB_TOKEN;
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&sort=updated&direction=desc`;

  const pulls = await fetchPaginated(url, githubToken);

  return (pulls || []).map((pr) => ({
    number: pr.number,
    title: pr.title || "Untitled",
    author: pr.user?.login || "unknown",
    url: pr.html_url,
    updatedAt: pr.updated_at || pr.created_at || "",
    draft: Boolean(pr.draft)
  }));
}

/**
 * Post a general comment on a pull request.
 * @param {{owner: string, repo: string, pullNumber: number, body: string, githubToken: string}} input
 * @returns {Promise<{ url: string, id: number }>}
 */
export async function postPullRequestComment(input) {
  const { owner, repo, pullNumber, body, githubToken } = input;
  if (!githubToken) {
    throw createAppError(
      ERROR_CODES.REPO_ACCESS_DENIED,
      "A GitHub token is required to post comments.",
      400
    );
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${pullNumber}/comments`;
  const response = await githubFetch(url, githubToken, {
    method: "POST",
    body: { body }
  });

  if (!response.ok) {
    const bodyText = await response.text();
    if (
      response.status === 403 &&
      bodyText.includes("Resource not accessible by personal access token")
    ) {
      throw createAppError(
        ERROR_CODES.REPO_ACCESS_DENIED,
        `Your token can read ${owner}/${repo} but cannot post comments. Install the GitHub App at https://github.com/apps/sentry-pr-review/installations/new (posts as the app bot), or use a token from the repo owner with Pull requests write access.`,
        403
      );
    }

    const replay = new Response(bodyText, {
      status: response.status,
      headers: response.headers
    });
    await throwGitHubError(replay);
  }

  const data = await response.json();
  return { url: data.html_url, id: data.id };
}
