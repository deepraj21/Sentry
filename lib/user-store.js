import { ObjectId } from "mongodb";
import { createAppError, ERROR_CODES } from "./errors.js";
import { hashPassword, verifyPassword } from "./auth.js";
import { getDatabase } from "./mongo.js";

const COLLECTION = "users";

function usersCollection(db) {
  return db.collection(COLLECTION);
}

/**
 * @param {import("mongodb").Db} db
 */
async function ensureIndexes(db) {
  await usersCollection(db).createIndex({ username: 1 }, { unique: true });
}

/**
 * Register a new user.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ id: string, username: string }>}
 */
export async function registerUser(username, password) {
  const normalized = String(username || "").trim().toLowerCase();
  if (normalized.length < 3) {
    throw createAppError(
      ERROR_CODES.INVALID_CREDENTIALS,
      "Username must be at least 3 characters.",
      400
    );
  }
  if (String(password || "").length < 6) {
    throw createAppError(
      ERROR_CODES.INVALID_CREDENTIALS,
      "Password must be at least 6 characters.",
      400
    );
  }

  const db = await getDatabase();
  await ensureIndexes(db);

  const passwordHash = await hashPassword(password);
  const now = new Date();

  try {
    const result = await usersCollection(db).insertOne({
      username: normalized,
      passwordHash,
      createdAt: now
    });

    return { id: result.insertedId.toString(), username: normalized };
  } catch (err) {
    if (err?.code === 11000) {
      throw createAppError(
        ERROR_CODES.USER_EXISTS,
        "Username is already taken.",
        409
      );
    }
    throw err;
  }
}

/**
 * Authenticate a user by username and password.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ id: string, username: string }>}
 */
export async function authenticateUser(username, password) {
  const normalized = String(username || "").trim().toLowerCase();
  const db = await getDatabase();
  await ensureIndexes(db);

  const user = await usersCollection(db).findOne({ username: normalized });
  if (!user) {
    throw createAppError(
      ERROR_CODES.INVALID_CREDENTIALS,
      "Invalid username or password.",
      401
    );
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw createAppError(
      ERROR_CODES.INVALID_CREDENTIALS,
      "Invalid username or password.",
      401
    );
  }

  return { id: user._id.toString(), username: user.username };
}

/**
 * Find a user by id.
 * @param {string} id
 * @returns {Promise<{ id: string, username: string }|null>}
 */
export async function findUserById(id) {
  if (!ObjectId.isValid(id)) return null;

  const db = await getDatabase();
  const user = await usersCollection(db).findOne({ _id: new ObjectId(id) });
  if (!user) return null;

  return { id: user._id.toString(), username: user.username };
}
