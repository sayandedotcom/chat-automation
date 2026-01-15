/**
 * Context types and creation for tRPC.
 * Supports both Express and standalone contexts.
 */

import type { Request, Response } from "express";

/**
 * Base context available to all procedures
 */
export interface BaseContext {
  /**
   * Unique request ID for tracing
   */
  requestId: string;
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
}

/**
 * Creates the context for each tRPC request.
 * This is called for every request and should be fast.
 */
export function createContext(opts: CreateContextOptions = {}): Context {
  const requestId = crypto.randomUUID();

  if (opts.req && opts.res) {
    return {
      requestId,
      req: opts.req,
      res: opts.res,
    };
  }

  return {
    requestId,
  };
}

/**
 * Type helper for inferring context in procedures
 */
export type InferContext<T extends Context = Context> = T;
