import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db, users, type User } from "@/lib/db";

const COOKIE_NAME = "dnd_session";
const SESSION_DAYS = 30;

/**
 * Fallback for local dev with no AUTH_SECRET. Random per process, so a
 * published or leaked constant can never mint a valid session; the cost is
 * that dev logins don't survive a server restart.
 */
const devSecret = new Uint8Array(randomBytes(32));

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET is not set");
    }
    return devSecret;
  }
  return new TextEncoder().encode(secret);
}

/**
 * Sign a session cookie for `userId`. `sessionVersion` is the account's
 * current value; the cookie stops verifying once the account moves past it,
 * which is how "sign out everywhere" reaches devices we cannot touch.
 */
export async function createSession(userId: string, sessionVersion: number) {
  const token = await new SignJWT({ sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

type SessionClaims = { userId: string; sessionVersion: number };

async function readSessionClaims(): Promise<SessionClaims | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub) return null;
    // Cookies signed before `sv` existed carry no version. Reading them as 1
    // — the column's default for every account that predates it — keeps those
    // sessions valid instead of signing everyone out on deploy.
    const sv = typeof payload.sv === "number" ? payload.sv : 1;
    return { userId: payload.sub, sessionVersion: sv };
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const claims = await readSessionClaims();
  if (!claims) return null;
  const user = await db.query.users.findFirst({ where: eq(users.id, claims.userId) });
  if (!user) return null;
  // A retired cookie is simply not a session. It is left in place rather than
  // deleted: this runs during page render, where cookies are read-only.
  if (claims.sessionVersion !== user.sessionVersion) return null;
  return user;
}

/** Load the signed-in user or bounce to /login. Use at the top of protected pages. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
