import { createAppError, ERROR_CODES } from "./errors.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL_FALLBACK = "anthropic/claude-sonnet-4";

/**
 * Sleep for backoff.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call OpenRouter chat completions API.
 * @param {{systemPrompt: string, userPrompt: string, model?: string}} input
 * @returns {Promise<{text: string, model: string}>}
 */
export async function callOpenRouter(input) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw createAppError(
      ERROR_CODES.LLM_ERROR,
      "Missing OPENROUTER_API_KEY environment variable.",
      500
    );
  }

  const model = input.model || process.env.DEFAULT_MODEL || DEFAULT_MODEL_FALLBACK;
  const payload = {
    model,
    temperature: 0.2,
    messages: [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: input.userPrompt }
    ]
  };

  /** @type {Response | null} */
  let response = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timeout);
      if (err && typeof err === "object" && /** @type {any} */ (err).name === "AbortError") {
        throw createAppError(
          ERROR_CODES.LLM_ERROR,
          "OpenRouter request timed out after 60 seconds.",
          504
        );
      }
      throw createAppError(
        ERROR_CODES.LLM_ERROR,
        "Failed to reach OpenRouter API.",
        502
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 500 && response.status < 600 && attempt < 2) {
      await delay(1200);
      continue;
    }
    break;
  }

  if (!response || !response.ok) {
    const status = response?.status || 500;
    if (status === 401) {
      throw createAppError(ERROR_CODES.LLM_ERROR, "Invalid OpenRouter API key.", 401);
    }
    if (status === 429) {
      throw createAppError(
        ERROR_CODES.LLM_ERROR,
        "OpenRouter rate limit exceeded. Please retry shortly.",
        429
      );
    }
    throw createAppError(
      ERROR_CODES.LLM_ERROR,
      `OpenRouter request failed with status ${status}.`,
      status >= 400 && status < 600 ? status : 502
    );
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") {
    throw createAppError(
      ERROR_CODES.LLM_ERROR,
      "OpenRouter response did not contain model output text.",
      502
    );
  }

  return {
    text,
    model: data?.model || model
  };
}
