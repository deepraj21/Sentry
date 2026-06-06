import crypto from "node:crypto";
import { createAppError, ERROR_CODES } from "./errors.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getEncryptionKey() {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) {
    throw createAppError(
      ERROR_CODES.INTERNAL_ERROR,
      "Missing JWT_SECRET or ENCRYPTION_KEY environment variable.",
      500
    );
  }
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypt a plaintext string for storage.
 * @param {string} plaintext
 * @returns {string} iv:authTag:ciphertext (hex)
 */
export function encryptSecret(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), "utf8"),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt a stored secret.
 * @param {string} stored
 * @returns {string}
 */
export function decryptSecret(stored) {
  const [ivHex, authTagHex, ciphertextHex] = String(stored || "").split(":");
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw createAppError(ERROR_CODES.INTERNAL_ERROR, "Invalid encrypted secret format.", 500);
  }

  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}
