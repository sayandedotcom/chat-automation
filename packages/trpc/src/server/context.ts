/**
 * Context types and creation for tRPC.
 * Supports both Express and standalone contexts.
 */

import type { Request, Response } from "express";

/**
 * Session information from Better Auth
 */
export interface SessionInfo {
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
  } | null;
  session: {
    id: string;
    expiresAt: Date;
  } | null;
}

/**
 * Base context available to all procedures
 */
export interface BaseContext {
  /**
   * Unique request ID for tracing
   */
  requestId: string;
  /**
   * Session info from Better Auth
   */
  session: SessionInfo;
}

/**
 * Context when running in Express
 */
export interface ExpressContext extends BaseContext {
  req: Request;
  res: Response;
}

/**
 * Full context type - union of all possible contexts
 */
export type Context = BaseContext | ExpressContext;

/**
 * Options for creating context
 */
export interface CreateContextOptions {
  req?: Request;
  res?: Response;
  session?: SessionInfo;
}

/**
 * Creates the context for each tRPC request.
 * This is called for every request and should be fast.
 */
export function createContext(opts: CreateContextOptions = {}): Context {
  const requestId = crypto.randomUUID();
  const session: SessionInfo = opts.session || { user: null, session: null };

  if (opts.req && opts.res) {
    return {
      requestId,
      session,
      req: opts.req,
      res: opts.res,
    };
  }

  return {
    requestId,
    session,
  };
}

/**
 * Type helper for inferring context in procedures
 */
export type InferContext<T extends Context = Context> = T;
