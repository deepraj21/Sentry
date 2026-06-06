import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { createAppError, ERROR_CODES } from "./errors.js";

const TOKEN_TTL = "7d";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw createAppError(
      ERROR_CODES.INTERNAL_ERROR,
      "Missing JWT_SECRET environment variable.",
      500
    );
  }
  return secret;
}

/**
 * Hash a plaintext password with scrypt.
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
  return `${salt}:${derived.toString("hex")}`;
}

/**
 * Compare a plaintext password against a stored hash.
 * @param {string} password
 * @param {string} stored
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;

  const derived = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });

  const hashBuffer = Buffer.from(hash, "hex");
  if (hashBuffer.length !== derived.length) return false;
  return crypto.timingSafeEqual(hashBuffer, derived);
}

/**
 * Issue a signed JWT for a user.
 * @param {{ id: string, username: string }} user
 * @returns {string}
 */
export function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username },
    getJwtSecret(),
    { expiresIn: TOKEN_TTL }
  );
}

/**
 * Verify a JWT and return its payload.
 * @param {string} token
 * @returns {{ sub: string, username: string }}
 */
export function verifyToken(token) {
  try {
    const payload = jwt.verify(token, getJwtSecret());
    if (!payload?.sub || !payload?.username) {
      throw createAppError(ERROR_CODES.INVALID_TOKEN, "Invalid token.", 401);
    }
    return { sub: String(payload.sub), username: String(payload.username) };
  } catch (err) {
    if (err?.code === ERROR_CODES.INVALID_TOKEN) throw err;
    throw createAppError(ERROR_CODES.INVALID_TOKEN, "Invalid or expired token.", 401);
  }
}

/**
 * Extract bearer token from Authorization header.
 * @param {import("express").Request} req
 * @returns {string|null}
 */
export function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

/**
 * Express middleware that requires a valid JWT.
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
export function requireAuth(req, res, next) {
  const token = getBearerToken(req);
  if (!token) {
    return res
      .status(401)
      .json({ success: false, error: { code: ERROR_CODES.UNAUTHORIZED, message: "Authentication required." } });
  }

  try {
    req.user = verifyToken(token);
    return next();
  } catch (err) {
    const status = err?.status || 401;
    return res.status(status).json({
      success: false,
      error: { code: err?.code || ERROR_CODES.UNAUTHORIZED, message: err?.message || "Authentication failed." }
    });
  }
}
