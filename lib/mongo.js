import { MongoClient } from "mongodb";

let cachedClient = null;
let cachedDb = null;

/**
 * Connect to MongoDB and return db handle.
 * @returns {Promise<import("mongodb").Db>}
 */
export async function getDatabase() {
  if (cachedDb) {
    return cachedDb;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Missing MONGODB_URI environment variable.");
  }

  cachedClient = new MongoClient(uri);
  await cachedClient.connect();
  cachedDb = cachedClient.db();
  return cachedDb;
}
