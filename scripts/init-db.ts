// npm run db:init  — creates all MongoDB indexes (idempotent).
import { closeDb } from "../lib/db";
import { ensureIndexes } from "../lib/db/indexes";

async function main() {
  await ensureIndexes();
  console.log("Indexes ensured.");
}

main()
  .catch((err: unknown) => {
    console.error("db:init failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
