import { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  // Sessions created before this field existed have no status set — treat as approved
  // rather than locking out everyone already logged in until they log back in.
  if (req.session.status === "pending" || req.session.status === "rejected") {
    res.status(403).json({ error: "AccountPending", status: req.session.status });
    return;
  }
  next();
}

// Session existence only, no approval-status gate — used for routes that pending/rejected
// users must still be able to reach (e.g. /auth/me, so the frontend can read their status).
export function requireSession(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export function requireRoles(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.session?.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.session.status !== "approved") {
      res.status(403).json({ error: "AccountPending", status: req.session.status });
      return;
    }
    if (!req.session.role || !roles.includes(req.session.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
