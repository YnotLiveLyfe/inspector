/**
 * Auth and origin validation middleware for the Inspector proxy server.
 *
 * Extracted from index.ts into a standalone module so the middleware logic
 * can be unit-tested without importing index.ts (which calls app.listen()
 * at the module level).
 *
 * The factories accept all runtime config as arguments instead of reading
 * module-scope constants, so tests can construct fresh instances with
 * test-specific tokens without touching process.env.
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { timingSafeEqual } from "crypto";

/**
 * Build the origin validation middleware. Rejects requests whose `Origin`
 * header is present AND not in the allowed list. A missing `Origin` header
 * is permitted (matches Inspector's existing behavior — absent Origin is
 * treated as same-origin or non-browser).
 */
export function createOriginValidationMiddleware(options: {
  clientPort: string;
  allowedOrigins?: string[];
}): RequestHandler {
  const defaultOrigin = `http://localhost:${options.clientPort}`;
  const allowedOrigins =
    options.allowedOrigins && options.allowedOrigins.length > 0
      ? options.allowedOrigins
      : [defaultOrigin];

  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;

    if (origin && !allowedOrigins.includes(origin)) {
      console.error(`Invalid origin: ${origin}`);
      res.status(403).json({
        error: "Forbidden - invalid origin",
        message:
          "Request blocked to prevent DNS rebinding attacks. Configure allowed origins via environment variable.",
      });
      return;
    }
    next();
  };
}

/**
 * Build the auth middleware. Requires `X-MCP-Proxy-Auth: Bearer <token>`
 * unless `authDisabled` is true (dev mode escape hatch).
 */
export function createAuthMiddleware(options: {
  sessionToken: string;
  authDisabled: boolean;
}): RequestHandler {
  const { sessionToken, authDisabled } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    if (authDisabled) {
      return next();
    }

    const sendUnauthorized = () => {
      res.status(401).json({
        error: "Unauthorized",
        message:
          "Authentication required. Use the session token shown in the console when starting the server.",
      });
    };

    const authHeader = req.headers["x-mcp-proxy-auth"];
    const authHeaderValue = Array.isArray(authHeader)
      ? authHeader[0]
      : authHeader;

    if (!authHeaderValue || !authHeaderValue.startsWith("Bearer ")) {
      sendUnauthorized();
      return;
    }

    const providedToken = authHeaderValue.substring(7);
    const expectedToken = sessionToken;

    const providedBuffer = Buffer.from(providedToken);
    const expectedBuffer = Buffer.from(expectedToken);

    if (providedBuffer.length !== expectedBuffer.length) {
      sendUnauthorized();
      return;
    }

    if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
      sendUnauthorized();
      return;
    }

    next();
  };
}
