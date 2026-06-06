import { ObjectId } from "mongodb";
import { createAppError, ERROR_CODES } from "./errors.js";
import { encryptSecret, decryptSecret } from "./crypto.js";
import { getDatabase } from "./mongo.js";
import { deleteReportsByProject } from "./report-store.js";

const COLLECTION = "projects";

function projectsCollection(db) {
  return db.collection(COLLECTION);
}

async function ensureIndexes(db) {
  await projectsCollection(db).createIndex({ userId: 1, owner: 1, repo: 1 }, { unique: true });
  await projectsCollection(db).createIndex({ userId: 1, createdAt: -1 });
}

function toProjectResponse(doc) {
  return {
    id: String(doc._id),
    owner: doc.owner,
    repo: doc.repo,
    fullName: doc.fullName,
    isPrivate: Boolean(doc.isPrivate),
    defaultBranch: doc.defaultBranch || "main",
    hasToken: Boolean(doc.githubTokenEncrypted),
    lastVerifiedAt: doc.lastVerifiedAt?.toISOString?.() || null,
    createdAt: doc.createdAt?.toISOString?.() || null
  };
}

/**
 * List projects for a user with optional search.
 * @param {string} userId
 * @param {string} [query]
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function listProjects(userId, query = "") {
  const db = await getDatabase();
  await ensureIndexes(db);

  const filter = { userId };
  const q = String(query || "").trim().toLowerCase();
  if (q) {
    filter.$or = [
      { fullName: { $regex: q, $options: "i" } },
      { owner: { $regex: q, $options: "i" } },
      { repo: { $regex: q, $options: "i" } }
    ];
  }

  const docs = await projectsCollection(db)
    .find(filter)
    .sort({ createdAt: -1 })
    .toArray();

  return docs.map(toProjectResponse);
}

/**
 * Get a project owned by user.
 * @param {string} userId
 * @param {string} projectId
 * @returns {Promise<Record<string, any> | null>}
 */
export async function getProjectById(userId, projectId) {
  if (!ObjectId.isValid(projectId)) return null;

  const db = await getDatabase();
  const doc = await projectsCollection(db).findOne({
    _id: new ObjectId(projectId),
    userId
  });

  return doc ? toProjectResponse(doc) : null;
}

/**
 * Get raw project doc including encrypted token (internal use).
 * @param {string} userId
 * @param {string} projectId
 * @returns {Promise<Record<string, any> | null>}
 */
export async function getProjectDoc(userId, projectId) {
  if (!ObjectId.isValid(projectId)) return null;

  const db = await getDatabase();
  return projectsCollection(db).findOne({
    _id: new ObjectId(projectId),
    userId
  });
}

/**
 * Decrypt the GitHub token for a project, if stored.
 * @param {Record<string, any>} projectDoc
 * @returns {string | undefined}
 */
export function getProjectGitHubToken(projectDoc) {
  if (!projectDoc?.githubTokenEncrypted) return undefined;
  return decryptSecret(projectDoc.githubTokenEncrypted);
}

/**
 * Create a new project for a user.
 * @param {string} userId
 * @param {{
 *   owner: string,
 *   repo: string,
 *   isPrivate: boolean,
 *   defaultBranch: string,
 *   githubToken?: string
 * }} input
 * @returns {Promise<Record<string, any>>}
 */
export async function createProject(userId, input) {
  const owner = String(input.owner || "").trim();
  const repo = String(input.repo || "").trim();
  if (!owner || !repo) {
    throw createAppError(ERROR_CODES.INVALID_REPO_URL, "Owner and repo are required.", 400);
  }

  const db = await getDatabase();
  await ensureIndexes(db);

  const now = new Date();
  const doc = {
    userId,
    owner,
    repo,
    fullName: `${owner}/${repo}`,
    isPrivate: Boolean(input.isPrivate),
    defaultBranch: input.defaultBranch || "main",
    githubTokenEncrypted: input.githubToken ? encryptSecret(input.githubToken) : null,
    lastVerifiedAt: now,
    createdAt: now
  };

  try {
    const result = await projectsCollection(db).insertOne(doc);
    return toProjectResponse({ ...doc, _id: result.insertedId });
  } catch (err) {
    if (err?.code === 11000) {
      throw createAppError(
        ERROR_CODES.PROJECT_EXISTS,
        "This repository is already connected to your account.",
        409
      );
    }
    throw err;
  }
}

/**
 * Update project verification timestamp and optional token.
 * @param {string} userId
 * @param {string} projectId
 * @param {{ githubToken?: string, defaultBranch?: string, isPrivate?: boolean }} updates
 */
export async function updateProject(userId, projectId, updates) {
  if (!ObjectId.isValid(projectId)) {
    throw createAppError(ERROR_CODES.PROJECT_NOT_FOUND, "Project not found.", 404);
  }

  const db = await getDatabase();
  const patch = { lastVerifiedAt: new Date() };

  if (updates.defaultBranch) patch.defaultBranch = updates.defaultBranch;
  if (typeof updates.isPrivate === "boolean") patch.isPrivate = updates.isPrivate;
  if (updates.githubToken) {
    patch.githubTokenEncrypted = encryptSecret(updates.githubToken);
  }

  const result = await projectsCollection(db).findOneAndUpdate(
    { _id: new ObjectId(projectId), userId },
    { $set: patch },
    { returnDocument: "after" }
  );

  if (!result) {
    throw createAppError(ERROR_CODES.PROJECT_NOT_FOUND, "Project not found.", 404);
  }

  return toProjectResponse(result);
}

/**
 * Delete a project and all related reports for the user.
 * @param {string} userId
 * @param {string} projectId
 * @returns {Promise<{ deletedReports: number }>}
 */
export async function deleteProject(userId, projectId) {
  if (!ObjectId.isValid(projectId)) {
    throw createAppError(ERROR_CODES.PROJECT_NOT_FOUND, "Project not found.", 404);
  }

  const db = await getDatabase();
  const existing = await projectsCollection(db).findOne({
    _id: new ObjectId(projectId),
    userId
  });

  if (!existing) {
    throw createAppError(ERROR_CODES.PROJECT_NOT_FOUND, "Project not found.", 404);
  }

  const deletedReports = await deleteReportsByProject(userId, projectId);

  const result = await projectsCollection(db).deleteOne({
    _id: new ObjectId(projectId),
    userId
  });

  if (result.deletedCount === 0) {
    throw createAppError(ERROR_CODES.PROJECT_NOT_FOUND, "Project not found.", 404);
  }

  return { deletedReports };
}
