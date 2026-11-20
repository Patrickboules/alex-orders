import "server-only";
import { MongoClient, type Db } from "mongodb";

// Scripts (scripts/*.ts) import this file too. They run under
// `node --conditions=react-server`, which makes "server-only" a no-op there.

const DEFAULT_DB_NAME = "alex-orders";

type MongoCache = { client?: MongoClient; promise?: Promise<MongoClient> };

const globalForMongo = globalThis as typeof globalThis & {
  __alexOrdersMongo?: MongoCache;
};

const cache: MongoCache =
  process.env.NODE_ENV === "production"
    ? {}
    : (globalForMongo.__alexOrdersMongo ??= {});

function getUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Add it to .env (see .env.example) or your deployment environment.",
    );
  }
  return uri;
}

/** Database name from the URI path (mongodb://host/<db>?...), or "alex-orders". */
export function dbNameFromUri(uri: string): string {
  const afterScheme = uri.slice(uri.indexOf("://") + 3);
  const afterCreds = afterScheme.slice(afterScheme.lastIndexOf("@") + 1);
  const slash = afterCreds.indexOf("/");
  if (slash === -1) return DEFAULT_DB_NAME;
  const path = afterCreds.slice(slash + 1).split("?")[0];
  const name = decodeURIComponent(path).trim();
  return name || DEFAULT_DB_NAME;
}

export async function getMongoClient(): Promise<MongoClient> {
  if (cache.client) return cache.client;
  if (!cache.promise) {
    const client = new MongoClient(getUri());
    cache.promise = client
      .connect()
      .then((c) => {
        cache.client = c;
        return c;
      })
      .catch((err) => {
        cache.promise = undefined; // allow a retry on the next call
        throw err;
      });
  }
  return cache.promise;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(dbNameFromUri(getUri()));
}

/** Close the cached client (used by scripts so the process can exit). */
export async function closeDb(): Promise<void> {
  const client = cache.client;
  cache.client = undefined;
  cache.promise = undefined;
  if (client) await client.close();
}
