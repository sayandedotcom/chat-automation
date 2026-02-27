export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

export interface JWEPayload {
  userId: string;
  email: string;
  name: string | null;
  image: string | null;
  sessionId: string;
  iat: number;
  exp: number;
}

export interface CookieConfig {
  name: string;
  idName: string;
  maxAge: number;
  httpOnly: boolean;
  path: string;
  secure: boolean;
  sameSite: "strict" | "lax" | "none";
  domain?: string;
}

export interface OAuthProfile {
  id: string;
  displayName: string;
  emails?: { value: string; verified?: boolean }[];
  photos?: { value: string }[];
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  user?: SessionUser;
}

export interface AppEnv {
  NODE_ENV: "development" | "production" | "test";
  PORT: number;
  APP_URL: string;
  DATABASE_URL: string;
  SESSION_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_CALLBACK_URL: string;
}
