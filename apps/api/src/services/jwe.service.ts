import { EncryptJWT, jwtDecrypt } from "jose";

import type { JWEPayload } from "../@types/index.js";
import { COOKIE_MAX_AGE, config } from "../config/index.js";

function getEncryptionKey(): Uint8Array {
  const secret = config.sessionSecret;
  return new TextEncoder().encode(secret.padEnd(32, "0").slice(0, 32));
}

export async function createSessionToken(
  payload: Omit<JWEPayload, "iat" | "exp">
): Promise<string> {
  const key = getEncryptionKey();
  const now = Math.floor(Date.now() / 1000);

  const token = await new EncryptJWT({
    userId: payload.userId,
    email: payload.email,
    name: payload.name,
    image: payload.image,
    sessionId: payload.sessionId,
  })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt(now)
    .setExpirationTime(now + COOKIE_MAX_AGE)
    .encrypt(key);

  return token;
}

export async function decryptSessionToken(token: string): Promise<JWEPayload | null> {
  try {
    const key = getEncryptionKey();
    const { payload } = await jwtDecrypt(token, key);

    return {
      userId: payload.userId as string,
      email: payload.email as string,
      name: payload.name as string | null,
      image: payload.image as string | null,
      sessionId: payload.sessionId as string,
      iat: payload.iat as number,
      exp: payload.exp as number,
    };
  } catch (error) {
    console.error("[JWE] Failed to decrypt token:", error);
    return null;
  }
}

export function generateSessionId(): string {
  return crypto.randomUUID();
}
