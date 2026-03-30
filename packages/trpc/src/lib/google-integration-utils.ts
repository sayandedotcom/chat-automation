import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { prisma } from "@workspace/database";

const GOOGLE_SERVICES = [
  "gmail",
  "google-docs",
  "google-sheets",
  "google-slides",
  "google-drive",
  "google-calendar",
] as const;

type GoogleService = (typeof GOOGLE_SERVICES)[number];

type GoogleIntegrationMetadata = {
  scopes?: string[];
  accountEmail?: string;
};

export type StoredGoogleCredentials = {
  service: string;
  accessToken: string;
  refreshToken: string | null;
  scopes: string[];
  accountEmail: string | null;
  expiresAt: Date | null;
};

export type GoogleIntegrationUpsertInput = {
  userId: string;
  service: GoogleService;
  accessToken: string;
  refreshToken?: string | null;
  scopes: string[];
  accountEmail: string;
  expiresInSeconds?: number;
};

function getEncryptionKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET not configured");
  }
  return createHash("sha256").update(secret).digest();
}

async function encryptSecret(value: string): Promise<string> {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

async function decryptSecret(value: string): Promise<string> {
  const key = getEncryptionKey();
  const [ivEncoded, authTagEncoded, encryptedEncoded] = value.split(".");
  if (!ivEncoded || !authTagEncoded || !encryptedEncoded) {
    throw new Error("Invalid encrypted secret payload");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivEncoded, "base64url"));
  decipher.setAuthTag(Buffer.from(authTagEncoded, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedEncoded, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function extractMetadata(metadata: unknown): GoogleIntegrationMetadata {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  const raw = metadata as Record<string, unknown>;
  const scopes = Array.isArray(raw["scopes"])
    ? raw["scopes"].filter((scope): scope is string => typeof scope === "string")
    : [];
  const accountEmail =
    typeof raw["accountEmail"] === "string" ? normalizeEmail(raw["accountEmail"]) : undefined;

  return { scopes, accountEmail };
}

function mergeScopes(existing: string[], incoming: string[]): string[] {
  return Array.from(
    new Set(
      [...existing, ...incoming].map((scope) => scope.trim()).filter((scope) => scope.length > 0)
    )
  ).sort();
}

function getExpiresAt(expiresInSeconds?: number): Date | null {
  if (!expiresInSeconds || expiresInSeconds <= 0) {
    return null;
  }
  return new Date(Date.now() + expiresInSeconds * 1000);
}

export function isGoogleService(service: string): service is GoogleService {
  return GOOGLE_SERVICES.includes(service as GoogleService);
}

export async function upsertGoogleIntegration(input: GoogleIntegrationUpsertInput): Promise<void> {
  const existingIntegrations = await prisma.integration.findMany({
    where: {
      userId: input.userId,
      provider: "google",
    },
    orderBy: { createdAt: "asc" },
  });

  const decryptedRefreshTokens = await Promise.all(
    existingIntegrations
      .filter((integration) => integration.refreshToken)
      .map(async (integration) =>
        integration.refreshToken ? decryptSecret(integration.refreshToken) : null
      )
  );
  const existingRefreshToken = decryptedRefreshTokens.find((token): token is string =>
    Boolean(token)
  );
  const nextRefreshToken = input.refreshToken ?? existingRefreshToken ?? null;
  const existingScopes = existingIntegrations.flatMap(
    (integration) => extractMetadata(integration.metadata).scopes ?? []
  );
  const mergedScopes = mergeScopes(existingScopes, input.scopes);
  const normalizedAccountEmail = normalizeEmail(input.accountEmail);
  const fallbackAccountEmail = extractMetadata(existingIntegrations[0]?.metadata).accountEmail;
  const accountEmail = normalizedAccountEmail || fallbackAccountEmail || null;
  const expiresAt = getExpiresAt(input.expiresInSeconds);
  const accessToken = await encryptSecret(input.accessToken);
  const refreshToken = nextRefreshToken ? await encryptSecret(nextRefreshToken) : null;
  const metadata = {
    scopes: mergedScopes,
    accountEmail,
  };

  await prisma.$transaction(async (tx) => {
    for (const integration of existingIntegrations) {
      await tx.integration.update({
        where: { id: integration.id },
        data: {
          accessToken,
          refreshToken,
          expiresAt,
          metadata,
        },
      });
    }

    await tx.integration.upsert({
      where: {
        userId_provider_service: {
          userId: input.userId,
          provider: "google",
          service: input.service,
        },
      },
      update: {
        accessToken,
        refreshToken,
        expiresAt,
        metadata,
      },
      create: {
        userId: input.userId,
        provider: "google",
        service: input.service,
        accessToken,
        refreshToken,
        expiresAt,
        metadata,
      },
    });
  });
}

export async function getStoredGoogleCredentials(
  userId: string
): Promise<StoredGoogleCredentials | null> {
  const integration = await prisma.integration.findFirst({
    where: {
      userId,
      provider: "google",
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!integration) {
    return null;
  }

  const metadata = extractMetadata(integration.metadata);

  return {
    service: integration.service,
    accessToken: await decryptSecret(integration.accessToken),
    refreshToken: integration.refreshToken ? await decryptSecret(integration.refreshToken) : null,
    scopes: metadata.scopes ?? [],
    accountEmail: metadata.accountEmail ?? null,
    expiresAt: integration.expiresAt,
  };
}

export async function refreshGoogleCredentialsIfNeeded(
  userId: string
): Promise<StoredGoogleCredentials | null> {
  const credentials = await getStoredGoogleCredentials(userId);
  if (!credentials) {
    return null;
  }

  if (!credentials.refreshToken) {
    return credentials;
  }

  const refreshThresholdMs = 60 * 1000;
  if (credentials.expiresAt && credentials.expiresAt.getTime() > Date.now() + refreshThresholdMs) {
    return credentials;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing Google OAuth credentials for token refresh");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: credentials.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token refresh failed: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in?: number;
    scope?: string;
  };

  await upsertGoogleIntegration({
    userId,
    service: credentials.service as GoogleService,
    accessToken: data.access_token,
    refreshToken: credentials.refreshToken,
    scopes: data.scope?.split(" ") ?? credentials.scopes,
    accountEmail: credentials.accountEmail ?? "",
    expiresInSeconds: data.expires_in,
  });

  return getStoredGoogleCredentials(userId);
}

export async function getConnectedGoogleServices(userId: string): Promise<string[]> {
  const integrations = await prisma.integration.findMany({
    where: {
      userId,
      provider: "google",
      service: { in: [...GOOGLE_SERVICES] },
    },
    select: { service: true },
  });

  return integrations.map((integration) => integration.service);
}

export async function disconnectGoogleService(
  userId: string,
  service: GoogleService
): Promise<void> {
  await prisma.integration.deleteMany({
    where: {
      userId,
      provider: "google",
      service,
    },
  });
}

export { GOOGLE_SERVICES };
