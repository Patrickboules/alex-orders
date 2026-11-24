// Props shapes for UI components. Pages map query results onto these, so the
// components stay independent of how the backend names things.

import type { Menu, MenuStatus, Multiplier, PaymentMethod, Receipt, ReceiptLine } from "@/lib/types";

export type { Menu, Multiplier, PaymentMethod, Receipt, ReceiptLine };

export interface RestaurantCardView {
  id: string;
  name: string;
  coverImageUrl?: string | null;
  itemCount: number;
  menuStatus?: MenuStatus;
  openOrderShortCode?: string | null;
}

export interface CartLineView {
  id: string;
  itemId: string;
  variantId?: string | null;
  name: string;
  quantity: number;
  unitPrice: number; // piasters
  note?: string | null;
}

export interface PaymentInfo {
  adminName: string;
  instapayQrUrl?: string | null;
  instapayHandle?: string | null;
}

export type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };
