import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { findAdminByToken } from "@/lib/data/admins";
import { findParticipantByToken } from "@/lib/data/participants";
import type { AdminDoc, ParticipantDoc } from "@/lib/types";

export const ADMIN_COOKIE = "admin_token";
export const PARTICIPANT_COOKIE = "participant_token";

const DAY = 60 * 60 * 24;
export const ADMIN_COOKIE_MAX_AGE = 30 * DAY;
export const PARTICIPANT_COOKIE_MAX_AGE = 365 * DAY;

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export async function getCurrentAdmin(): Promise<AdminDoc | null> {
  // Request-time only: the DB lookup must not run during prerendering.
  await connection();
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  return findAdminByToken(token);
}

/** For pages and actions: redirects to /admin/login when no valid admin token. */
export async function requireAdmin(): Promise<AdminDoc> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

export async function getCurrentParticipant(): Promise<ParticipantDoc | null> {
  // Request-time only: the DB lookup must not run during prerendering.
  await connection();
  const token = (await cookies()).get(PARTICIPANT_COOKIE)?.value;
  if (!token) return null;
  return findParticipantByToken(token);
}

// Cookie writers: only callable from Server Actions / Route Handlers.
export async function setAdminCookie(token: string): Promise<void> {
  (await cookies()).set(ADMIN_COOKIE, token, cookieOptions(ADMIN_COOKIE_MAX_AGE));
}
export async function clearAdminCookie(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
}
export async function setParticipantCookie(token: string): Promise<void> {
  (await cookies()).set(PARTICIPANT_COOKIE, token, cookieOptions(PARTICIPANT_COOKIE_MAX_AGE));
}
export async function clearParticipantCookie(): Promise<void> {
  (await cookies()).delete(PARTICIPANT_COOKIE);
}
