import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE_NAME = "arsip_session";

function sign(value: string): string {
  const secret = process.env.SESSION_SECRET || "change-me";
  const hmac = crypto.createHmac("sha256", secret).update(value).digest("hex");
  return `${value}.${hmac}`;
}

function verify(signed: string): boolean {
  const secret = process.env.SESSION_SECRET || "change-me";
  const [value, hmac] = signed.split(".");
  if (!value || !hmac) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(value)
    .digest("hex");
  return hmac === expected;
}

export function createSessionCookieValue(): string {
  return sign("authenticated");
}

export function isValidSession(): boolean {
  const store = cookies();
  const cookie = store.get(COOKIE_NAME);
  if (!cookie) return false;
  return verify(cookie.value);
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
