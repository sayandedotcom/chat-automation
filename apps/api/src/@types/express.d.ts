import type { SessionUser } from "./index.js";

declare global {
  namespace Express {
    interface User extends SessionUser {}
  }
}

export {};
