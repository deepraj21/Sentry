import jwt from "jsonwebtoken";
import { createAppError, ERROR_CODES } from "./errors.js";

export const GITHUB_APP_INSTALL_URL =
  "https://github.com/apps/sentry-pr-review/installations/new";

function getAppConfig() {
  const appId = process.env.GITHUB_APP_ID;
  const rawKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !rawKey) {
    return null;
  }

  const privateKey = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
  return { appId, privateKey };
}

/**
 * @returns {boolean}
 */
export function isGitHubAppConfigured() {
  return Boolean(getAppConfig());
}

/**
 * Create a short-lived GitHub App JWT.
 * @returns {string}
 */
function createAppJwt() {
  const config = getAppConfig();
  if (!config) {
    throw createAppError(
      ERROR_CODES.INTERNAL_ERROR,
      "GitHub App is not configured.",
      500
    );
  }

  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iat: now - 60,
      exp: now + 9 * 60,
      iss: config.appId
    },
    config.privateKey,
    { algorithm: "RS256" }
  );
}

/**
 * @param {string} url
 * @param {string} appJwt
 * @param {{ method?: string, body?: Record<string, any> }} [options]
 */
async function githubAppFetch(url, appJwt, options = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${appJwt}`,
    "User-Agent": "sentry-pr-reviewer"
  };

  const init = { method: options.method || "GET", headers };
  if (options.body) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  return fetch(url, init);
}

/**
 * Get an installation access token for a repository.
 * @param {string} owner
 * @param {string} repo
 * @returns {Promise<string|null>}
 */
export async function getInstallationTokenForRepo(owner, repo) {
  if (!isGitHubAppConfigured()) {
    return null;
  }

  const appJwt = createAppJwt();
  const installResponse = await githubAppFetch(
    `https://api.github.com/repos/${owner}/${repo}/installation`,
    appJwt
  );

  if (installResponse.status === 404) {
    return null;
  }

  if (!installResponse.ok) {
    const body = await installResponse.text();
    throw createAppError(
      ERROR_CODES.GITHUB_API_ERROR,
      `Failed to find GitHub App installation for ${owner}/${repo}. ${body.slice(0, 120)}`,
      installResponse.status
    );
  }

  const installation = await installResponse.json();
  const tokenResponse = await githubAppFetch(
    `https://api.github.com/app/installations/${installation.id}/access_tokens`,
    appJwt,
    { method: "POST" }
  );

  if (!tokenResponse.ok) {
    const body = await tokenResponse.text();
    throw createAppError(
      ERROR_CODES.GITHUB_API_ERROR,
      `Failed to create GitHub App installation token. ${body.slice(0, 120)}`,
      tokenResponse.status
    );
  }

  const tokenData = await tokenResponse.json();
  return tokenData.token || null;
}

/**
 * Check whether this GitHub App is installed on a repository.
 * @param {string} owner
 * @param {string} repo
 * @returns {Promise<{ configured: boolean, installed: boolean, installUrl: string }>}
 */
export async function getAppInstallationStatus(owner, repo) {
  const base = {
    configured: isGitHubAppConfigured(),
    installed: false,
    installUrl: GITHUB_APP_INSTALL_URL
  };

  if (!base.configured) {
    return base;
  }

  const appJwt = createAppJwt();
  const installResponse = await githubAppFetch(
    `https://api.github.com/repos/${owner}/${repo}/installation`,
    appJwt
  );

  return {
    ...base,
    installed: installResponse.ok
  };
}

/**
 * Resolve the token used to post PR review comments.
 * Priority: GitHub App installation token → GITHUB_BOT_TOKEN → project/env PAT.
 * @param {{ owner: string, repo: string, fallbackToken?: string }} input
 * @returns {Promise<string>}
 */
export async function resolveCommentPostingToken(input) {
  const { owner, repo, fallbackToken } = input;

  const appToken = await getInstallationTokenForRepo(owner, repo);
  if (appToken) {
    return appToken;
  }

  const botToken = process.env.GITHUB_BOT_TOKEN;
  if (botToken) {
    return botToken;
  }

  const personalToken = fallbackToken || process.env.GITHUB_TOKEN;
  if (personalToken) {
    return personalToken;
  }

  if (isGitHubAppConfigured()) {
    throw createAppError(
      ERROR_CODES.REPO_ACCESS_DENIED,
      `GitHub App credentials are loaded, but the app is not installed on ${owner}/${repo}. Install it at https://github.com/apps/sentry-pr-review/installations/new, or set GITHUB_TOKEN in .env for personal-account comments.`,
      400
    );
  }

  throw createAppError(
    ERROR_CODES.REPO_ACCESS_DENIED,
    "PR comments require a GitHub token. Install the GitHub App on the repo, set GITHUB_BOT_TOKEN, or set GITHUB_TOKEN in .env.",
    400
  );
}
