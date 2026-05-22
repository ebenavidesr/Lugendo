import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { logger } from "./logger";

const PgSession = connectPgSimple(session);

if (!process.env.SESSION_SECRET) {
  logger.error("SESSION_SECRET env var is required");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  logger.error("DATABASE_URL env var is required");
  process.exit(1);
}

export const sessionMiddleware = session({
  store: new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: "sessions",
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  },
});
