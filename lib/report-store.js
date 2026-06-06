import { ObjectId } from "mongodb";
import { getDatabase } from "./mongo.js";

const COLLECTION = "reports";

const PUBLIC_VISIBILITY_FILTER = {
  $or: [{ visibility: "public" }, { visibility: { $exists: false } }]
};

/**
 * Persist an analysis report.
 * @param {{
 *   prUrl: string,
 *   pr: Record<string, any>,
 *   report: Record<string, any>,
 *   metadata: Record<string, any>,
 *   userId?: string | null,
 *   projectId?: string | null,
 *   owner?: string,
 *   repo?: string,
 *   pullNumber?: number,
 *   visibility?: "public" | "private"
 * }} payload
 * @returns {Promise<string>} inserted report id
 */
export async function saveReport(payload) {
  const db = await getDatabase();
  const collection = db.collection(COLLECTION);

  const result = await collection.insertOne({
    prUrl: payload.prUrl,
    pr: payload.pr,
    report: payload.report,
    metadata: payload.metadata,
    userId: payload.userId ?? null,
    projectId: payload.projectId ?? null,
    owner: payload.owner || null,
    repo: payload.repo || null,
    pullNumber: payload.pullNumber ?? null,
    visibility: payload.visibility || "public",
    createdAt: new Date()
  });

  return String(result.insertedId);
}

/**
 * Fetch recent public reports for home page cards.
 * @param {number} [limit=8]
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function getRecentReports(limit = 8) {
  const db = await getDatabase();
  const collection = db.collection(COLLECTION);

  const docs = await collection
    .find(PUBLIC_VISIBILITY_FILTER, {
      projection: { pr: 1, report: 1, metadata: 1, prUrl: 1, createdAt: 1, visibility: 1 }
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map(formatReportCard);
}

export async function getProjectReports(userId, projectId, limit = 20) {
  if (!ObjectId.isValid(projectId)) return [];

  const db = await getDatabase();
  const docs = await db
    .collection(COLLECTION)
    .find({ userId, projectId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map(formatReportCard);
}

/**
 * Delete all reports linked to a project for a user.
 * @param {string} userId
 * @param {string} projectId
 * @returns {Promise<number>}
 */
export async function deleteReportsByProject(userId, projectId) {
  const db = await getDatabase();
  const result = await db.collection(COLLECTION).deleteMany({ userId, projectId });
  return result.deletedCount;
}

/**
 * Delete a single report scoped to a user's project.
 * @param {string} userId
 * @param {string} projectId
 * @param {string} reportId
 * @returns {Promise<boolean>}
 */
export async function deleteProjectReport(userId, projectId, reportId) {
  if (!ObjectId.isValid(projectId) || !ObjectId.isValid(reportId)) {
    return false;
  }

  const db = await getDatabase();
  const result = await db.collection(COLLECTION).deleteOne({
    _id: new ObjectId(reportId),
    userId,
    projectId
  });

  return result.deletedCount > 0;
}

/**
 * @param {string} id
 * @returns {Promise<Record<string, any> | null>}
 */
export async function getReportById(id) {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  const db = await getDatabase();
  const collection = db.collection(COLLECTION);

  const doc = await collection.findOne({ _id: new ObjectId(id) });
  if (!doc) {
    return null;
  }

  return formatReportDetail(doc);
}

/**
 * Check if a user can access a report.
 * @param {Record<string, any>} doc
 * @param {string | null | undefined} userId
 * @returns {boolean}
 */
export function canAccessReport(doc, userId) {
  if (!doc) return false;
  const visibility = doc.visibility || "public";
  if (visibility === "public" || !doc.visibility) return true;
  return Boolean(userId && doc.userId === userId);
}

/**
 * Mark a report as having a posted GitHub comment.
 * @param {string} id
 * @param {{ url: string, githubCommentId: number }} commentMeta
 */
export async function markCommentPosted(id, commentMeta) {
  if (!ObjectId.isValid(id)) return;

  const db = await getDatabase();
  await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        githubCommentUrl: commentMeta.url,
        githubCommentId: commentMeta.githubCommentId,
        commentPostedAt: new Date()
      }
    }
  );
}

function formatReportCard(doc) {
  return {
    id: String(doc._id),
    prUrl: doc.prUrl,
    pr: doc.pr,
    report: {
      verdict: doc.report?.verdict || "NEEDS_DISCUSSION",
      confidence: doc.report?.confidence ?? 0,
      summary: doc.report?.summary || ""
    },
    metadata: {
      model: doc.metadata?.model || "",
      analyzedAt: doc.metadata?.analyzedAt || doc.createdAt?.toISOString?.() || ""
    },
    createdAt: doc.createdAt
  };
}

function formatReportDetail(doc) {
  return {
    id: String(doc._id),
    prUrl: doc.prUrl,
    pr: doc.pr,
    report: doc.report,
    metadata: doc.metadata,
    userId: doc.userId || null,
    projectId: doc.projectId || null,
    owner: doc.owner || null,
    repo: doc.repo || null,
    pullNumber: doc.pullNumber ?? null,
    visibility: doc.visibility || "public",
    githubCommentUrl: doc.githubCommentUrl || null,
    commentPostedAt: doc.commentPostedAt?.toISOString?.() || null
  };
}
