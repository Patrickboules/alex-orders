"use server";

import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ADMIN_COOKIE, clearAdminCookie, getCurrentAdmin, setAdminCookie } from "@/lib/auth";
import { addAdminToken, findAdminByPhone, removeAdminToken } from "@/lib/data/admins";
import { normalizeEgyptPhone } from "@/lib/phone";
import { pickFormData, type ActionResult } from "./types";

const LOGIN_ERROR = "Incorrect phone or password";
// Compared against when the phone is unknown, so response time doesn't reveal which was wrong.
const DUMMY_HASH = "$2b$10$DAro9yNXQa8oj0mawsNPK.FhGAgfVhNJwKhbLtQNOC.qwVRVbwoZC";

const loginSchema = z.object({
  phone: z.string().trim().min(1).max(30),
  password: z.string().min(1).max(200),
});

/**
 * Logs in with phone + password. On success redirects to /admin (or the form's
 * "next" field if it is an /admin path). Works as action(formData) or with useActionState.
 */
export async function loginAdmin(
  prevOrForm: unknown,
  maybeForm?: unknown,
): Promise<ActionResult> {
  const formData = pickFormData(prevOrForm, maybeForm);
  if (!formData) return { ok: false, error: LOGIN_ERROR };

  const parsed = loginSchema.safeParse({
    phone: formData.get("phone") ?? "",
    password: formData.get("password") ?? "",
  });
  if (!parsed.success) return { ok: false, error: LOGIN_ERROR };

  let target = "/admin";
  try {
    const phone = normalizeEgyptPhone(parsed.data.phone);
    const admin = phone ? await findAdminByPhone(phone) : null;
    const valid = await bcrypt.compare(parsed.data.password, admin?.passwordHash ?? DUMMY_HASH);
    if (!admin || !valid) return { ok: false, error: LOGIN_ERROR };

    const token = nanoid(32);
    await addAdminToken(admin._id.toString(), token);
    await setAdminCookie(token);

    const next = formData.get("next");
    if (typeof next === "string" && /^\/admin(\/|$)/.test(next) && !next.startsWith("/admin/login")) {
      target = next;
    }
  } catch (err) {
    console.error("loginAdmin failed", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  redirect(target);
}

/** Clears the admin's token and cookie, then redirects to /admin/login. */
export async function logoutAdmin(): Promise<ActionResult> {
  try {
    const admin = await getCurrentAdmin();
    const token = (await cookies()).get(ADMIN_COOKIE)?.value;
    if (admin && token) await removeAdminToken(admin._id.toString(), token);
    await clearAdminCookie();
  } catch (err) {
    console.error("logoutAdmin failed", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  redirect("/admin/login");
}
