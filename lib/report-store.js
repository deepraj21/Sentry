import { getDatabase } from "./mongo.js";

const COLLECTION = "reports";

/**
 * Persist an analysis report.
 * @param {{
 *   prUrl: string,
 *   pr: Record<string, any>,
 *   report: Record<string, any>,
 *   metadata: Record<string, any>
 * }} payload
 * @returns {Promise<void>}
 */
export async function saveReport(payload) {
  const db = await getDatabase();
  const collection = db.collection(COLLECTION);

  await collection.insertOne({
    prUrl: payload.prUrl,
    pr: payload.pr,
    report: payload.report,
    metadata: payload.metadata,
    createdAt: new Date()
  });
}

/**
 * Fetch recent reports for home page cards.
 * @param {number} [limit=8]
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function getRecentReports(limit = 8) {
  const db = await getDatabase();
  const collection = db.collection(COLLECTION);

  const docs = await collection
    .find({}, { projection: { pr: 1, report: 1, metadata: 1, prUrl: 1, createdAt: 1 } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map((doc) => ({
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
  }));
}
