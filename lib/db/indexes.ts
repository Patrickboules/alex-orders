import "server-only";
import { admins, groupOrders, orderLines, participants } from "./collections";

/**
 * Create every index the app relies on. Safe to run repeatedly:
 * createIndex is a no-op when an identical index already exists.
 */
export async function ensureIndexes(): Promise<void> {
  const [adminsCol, participantsCol, groupOrdersCol, orderLinesCol] =
    await Promise.all([admins(), participants(), groupOrders(), orderLines()]);

  await Promise.all([
    participantsCol.createIndex({ phone: 1 }, { unique: true, name: "phone_unique" }),
    participantsCol.createIndex({ token: 1 }, { unique: true, name: "token_unique" }),

    adminsCol.createIndex({ phone: 1 }, { unique: true, name: "phone_unique" }),
    adminsCol.createIndex({ token: 1 }, { sparse: true, name: "token_sparse" }),

    groupOrdersCol.createIndex({ shortCode: 1 }, { unique: true, name: "shortCode_unique" }),
    groupOrdersCol.createIndex({ status: 1 }, { name: "status" }),
    groupOrdersCol.createIndex({ restaurantId: 1, status: 1 }, { name: "restaurantId_status" }),

    orderLinesCol.createIndex(
      { groupOrderId: 1, participantId: 1 },
      { name: "groupOrderId_participantId" },
    ),
  ]);
}
