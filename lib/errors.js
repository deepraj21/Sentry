export const ERROR_CODES = {
  INVALID_PR_URL: "INVALID_PR_URL",
  PR_NOT_FOUND: "PR_NOT_FOUND",
  GITHUB_RATE_LIMITED: "GITHUB_RATE_LIMITED",
  GITHUB_API_ERROR: "GITHUB_API_ERROR",
  LLM_ERROR: "LLM_ERROR",
  LLM_PARSE_ERROR: "LLM_PARSE_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  REPORT_NOT_FOUND: "REPORT_NOT_FOUND"
};

/**
 * Create a typed application error.
 * @param {string} code
 * @param {string} message
 * @param {number} status
 * @returns {Error & {code: string, status: number}}
 */
export function createAppError(code, message, status = 500) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

/**
 * Create a success response envelope.
 * @param {Record<string, any>} payload
 * @returns {Record<string, any>}
 */
export function successEnvelope(payload = {}) {
  return {
    success: true,
    ...payload
  };
}

/**
 * Create an error response envelope.
 * @param {string} code
 * @param {string} message
 * @returns {{success: false, error: {code: string, message: string}}}
 */
export function errorEnvelope(code, message) {
  return {
    success: false,
    error: { code, message }
  };
}

/**
 * Infer if a GitHub response indicates rate limiting.
 * @param {number} status
 * @param {Headers} headers
 * @param {string} bodyText
 * @returns {boolean}
 */
export function isGitHubRateLimit(status, headers, bodyText = "") {
  if (status === 429) {
    return true;
  }
  if (status !== 403) {
    return false;
  }

  const remaining = headers?.get?.("x-ratelimit-remaining");
  if (remaining === "0") {
    return true;
  }

  return /rate limit/i.test(bodyText);
}

/**
 * Convert unknown thrown values into a normalized AppError-like object.
 * @param {unknown} err
 * @returns {{code: string, message: string, status: number}}
 */
export function normalizeError(err) {
  if (err && typeof err === "object") {
    const anyErr = /** @type {any} */ (err);
    return {
      code: anyErr.code || ERROR_CODES.INTERNAL_ERROR,
      message: anyErr.message || "Unexpected server error",
      status: Number.isInteger(anyErr.status) ? anyErr.status : 500
    };
  }

  return {
    code: ERROR_CODES.INTERNAL_ERROR,
    message: "Unexpected server error",
    status: 500
  };
}
