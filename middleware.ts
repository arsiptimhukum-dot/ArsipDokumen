import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "arsip_session";

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verify(signed: string, secret: string): Promise<boolean> {
  const [value, hmac] = signed.split(".");
  if (!value || !hmac) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value)
  );
  const expected = toHex(signature);
  return hmac === expected;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon");

  if (isPublic) return NextResponse.next();

  const cookie = req.cookies.get(COOKIE_NAME);
  const secret = process.env.SESSION_SECRET || "change-me";

  if (!cookie || !(await verify(cookie.value, secret))) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Belum login" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
