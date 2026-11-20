// npm run seed:admin -- --name "Alex" --phone "01012345678" --password "secret"
import { parseArgs } from "node:util";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { closeDb } from "../lib/db";
import { admins } from "../lib/db/collections";
import { ensureIndexes } from "../lib/db/indexes";
import type { AdminDoc } from "../lib/types";

const MAX_ADMINS = 4;

// Local copy of the Egyptian mobile normalizer (lib/phone.ts is owned by the
// backend module; scripts keep their own to stay independent).
function normalizeEgyptPhone(input: string): string | null {
  let digits = input.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.startsWith("0020")) digits = "0" + digits.slice(4);
  else if (digits.startsWith("20") && digits.length === 12) digits = "0" + digits.slice(2);
  return /^01\d{9}$/.test(digits) ? digits : null;
}

async function main() {
  const { values } = parseArgs({
    options: {
      name: { type: "string" },
      phone: { type: "string" },
      password: { type: "string" },
    },
  });

  const name = values.name?.trim();
  const password = values.password;
  if (!name || !values.phone || !password) {
    throw new Error('Usage: npm run seed:admin -- --name "..." --phone "..." --password "..."');
  }
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");

  const phone = normalizeEgyptPhone(values.phone);
  if (!phone) throw new Error(`Invalid Egyptian mobile number: ${values.phone}`);

  await ensureIndexes();
  const col = await admins();

  if (await col.findOne({ phone })) {
    throw new Error(`An admin with phone ${phone} already exists.`);
  }
  const count = await col.countDocuments();
  if (count >= MAX_ADMINS) {
    throw new Error(`There are already ${count} admins (max ${MAX_ADMINS}). Refusing to add another.`);
  }

  const doc: AdminDoc = {
    _id: new ObjectId(),
    name,
    phone,
    passwordHash: await bcrypt.hash(password, 10),
    createdAt: new Date(),
  };
  await col.insertOne(doc);
  console.log(`Admin created: ${name} (${phone}). ${count + 1}/${MAX_ADMINS} admins.`);
}

main()
  .catch((err: unknown) => {
    console.error("seed:admin failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
