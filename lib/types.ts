// Shared domain types. Every module imports from here.
// All money values are integers in piasters (1 EGP = 100 piasters).

import type { ObjectId } from "mongodb";

// Tax & service multiplier per group order; 1 means none.
export type Multiplier = 1 | 1.12 | 1.14 | 1.26;
export const MULTIPLIERS: readonly Multiplier[] = [1, 1.12, 1.14, 1.26] as const;
export const MULTIPLIER_OPTIONS: readonly { value: Multiplier; label: string }[] = [
  { value: 1, label: "None" },
  { value: 1.12, label: "×1.12" },
  { value: 1.14, label: "×1.14" },
  { value: 1.26, label: "×1.26" },
];

export type MenuStatus = "empty" | "draft" | "published";
export type GroupOrderStatus = "open" | "closed";
export type PaymentMethod = "cash" | "instapay";
export type SourceType = "image" | "pdf" | "link";

// ---------- Menu (embedded in Restaurant) ----------

export interface MenuVariant {
  id: string; // nanoid
  name: string;
  price: number; // piasters
}

export interface MenuItem {
  id: string; // nanoid
  name: string;
  description?: string;
  price: number; // piasters; base price (or first variant's price)
  variants?: MenuVariant[];
}

export interface MenuCategory {
  id: string; // nanoid
  name: string;
  items: MenuItem[];
}

export interface Menu {
  categories: MenuCategory[];
}

// ---------- Collections ----------

export interface AdminDoc {
  _id: ObjectId;
  name: string;
  phone: string; // normalized 01XXXXXXXXX
  passwordHash: string; // bcrypt
  tokens?: string[]; // one random login token per signed-in device ("admin_token" cookie), newest last
  createdAt: Date;
}

export interface SourceFile {
  url: string;
  type: SourceType;
}

export interface RestaurantDoc {
  _id: ObjectId;
  name: string;
  phone?: string;
  coverImageUrl?: string;
  menuStatus: MenuStatus;
  menu: Menu; // the published (or only) menu
  draftMenu?: Menu; // parse result awaiting review
  sourceFiles: SourceFile[];
  createdBy: ObjectId; // admin
  createdAt: Date;
  updatedAt: Date;
}

export interface ParticipantDoc {
  _id: ObjectId;
  name: string;
  phone: string; // unique, normalized 01XXXXXXXXX
  token: string; // random token stored in the "participant_token" cookie
  createdAt: Date;
}

export interface PaymentRecord {
  participantId: ObjectId;
  paidAt: Date;
  paidMethod: PaymentMethod;
  amountAtPayment: number; // piasters
}

export interface GroupOrderDoc {
  _id: ObjectId;
  shortCode: string; // unique, 8+ chars, used in /o/[shortCode]
  restaurantId: ObjectId;
  title: string;
  status: GroupOrderStatus;
  multiplier: Multiplier;
  createdBy: ObjectId; // admin
  createdAt: Date;
  closedAt?: Date;
  payments: PaymentRecord[];
  // How each participant says they'll pay (set by them; admins confirm with payments).
  paymentChoices?: PaymentChoice[];
}

export interface PaymentChoice {
  participantId: ObjectId;
  method: PaymentMethod;
  chosenAt: Date;
}

export interface OrderLineDoc {
  _id: ObjectId;
  groupOrderId: ObjectId;
  participantId: ObjectId;
  itemId: string;
  variantId?: string;
  nameSnapshot: string; // e.g. "Classic Burger – Double"
  categoryIdSnapshot: string;
  priceSnapshot: number; // piasters, unit price at time of adding
  quantity: number; // 1..20
  note?: string; // max 140 chars
  createdAt: Date;
  updatedAt: Date;
}

// ---------- Computed (not stored) ----------

export interface ReceiptLine {
  lineId: string;
  name: string;
  quantity: number;
  unitPrice: number; // piasters
  lineTotal: number; // piasters
  note?: string;
}

export interface Receipt {
  participantId: string;
  participantName: string;
  participantPhone: string;
  lines: ReceiptLine[];
  subtotal: number; // piasters
  multiplier: Multiplier;
  total: number; // piasters, subtotal × multiplier rounded UP to whole EGP
  paid: boolean;
  paidMethod?: PaymentMethod;
  paymentChoice?: PaymentMethod; // what the participant said they'll use
  amountChangedSincePayment: boolean;
}

export interface RegroupedLine {
  itemId: string;
  variantId?: string;
  name: string;
  categoryId: string;
  totalQuantity: number;
  unitPrice: number;
  lineTotal: number;
  notes: { participantName: string; note: string }[];
}

export interface RegroupedOrder {
  categories: { id: string; name: string; lines: RegroupedLine[] }[];
  subtotal: number;
  multiplier: Multiplier;
  grandTotal: number; // sum of every participant's rounded total
}

// ---------- Parsing ----------

export type ParseInput =
  | { kind: "images"; files: { buffer: Buffer; mimeType: string; name: string }[] }
  | { kind: "pdf"; file: { buffer: Buffer; name: string } }
  | { kind: "link"; url: string };

export interface ParsePageResult {
  page: number; // 1-based
  ok: boolean;
  error?: string; // e.g. "Could not read"
}

export interface ParseResult {
  menu: Menu; // merged, ids assigned, prices in piasters
  pages: ParsePageResult[];
}
