import "server-only";
import type { Collection } from "mongodb";
import { getDb } from "../db";
import type {
  AdminDoc,
  GroupOrderDoc,
  OrderLineDoc,
  ParticipantDoc,
  RestaurantDoc,
} from "../types";

export const COLLECTIONS = {
  admins: "admins",
  restaurants: "restaurants",
  participants: "participants",
  groupOrders: "groupOrders",
  orderLines: "orderLines",
} as const;

export async function admins(): Promise<Collection<AdminDoc>> {
  return (await getDb()).collection<AdminDoc>(COLLECTIONS.admins);
}

export async function restaurants(): Promise<Collection<RestaurantDoc>> {
  return (await getDb()).collection<RestaurantDoc>(COLLECTIONS.restaurants);
}

export async function participants(): Promise<Collection<ParticipantDoc>> {
  return (await getDb()).collection<ParticipantDoc>(COLLECTIONS.participants);
}

export async function groupOrders(): Promise<Collection<GroupOrderDoc>> {
  return (await getDb()).collection<GroupOrderDoc>(COLLECTIONS.groupOrders);
}

export async function orderLines(): Promise<Collection<OrderLineDoc>> {
  return (await getDb()).collection<OrderLineDoc>(COLLECTIONS.orderLines);
}
