import { Router, type IRouter } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import { usersTable, agenciesTable, invitationsTable } from "@workspace/db";
import { requireSession } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { LoginInputSchema, RegisterInputSchema, ForgotPasswordInputSchema, ResetPasswordInputSchema } from "../lib/schemas";
import { sendApprovalRequestEmail, sendEmailVerificationEmail, sendPasswordResetEmail } from "../lib/email";
import { PUBLIC_APP_URL } from "../lib/publicUrl";
import { ensureTripClassificationByDates } from "../lib/trip-classification";

const router: IRouter = Router();
const ADMIN_NOTIFICATION_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || "ebenavidesr@gmail.com";
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

// Invalidates every other active session belonging to this user in the connect-pg-simple
// `sessions` table (pre-created manually, not a Drizzle model — see CLAUDE.md). The `sess`
// column stores the serialized SessionData as JSON, so userId is matched via a jsonb cast.
async function invalidateOtherSessions(userId: number, exceptSid?: string): Promise<void> {
  await pool.query(
    `DELETE FROM sessions WHERE (sess::jsonb->>'userId')::int = $1 AND sid IS DISTINCT FROM $2`,
    [userId, exceptSid ?? null],
  );
}

function renderInfoPage(title: string, message: string): string {
  return `
    <!DOCTYPE html>
    <html lang="es">
      <head><meta charset="utf-8"><title>${title}</title></head>
      <body style="font-family:'DM Sans',Arial,sans-serif;background:#FAF2EB;color:#2D1F0E;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
        <div style="background:#fff;padding:32px 40px;border-radius:16px;text-align:center;max-width:420px">
          <h1 style="margin:0 0 12px;font-size:20px">${title}</h1>
          <p style="margin:0;color:#6B5744;font-size:15px">${message}</p>
        </div>
      </body>
    </html>
  `;
}

router.get("/auth/me", requireSession, async (req, res): Promise<void> => {
  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      agencyId: usersTable.agencyId,
      status: usersTable.status,
      emailVerified: usersTable.emailVerified,
      agencyName: agenciesTable.name,
    })
    .from(usersTable)
    .leftJoin(agenciesTable, eq(usersTable.agencyId, agenciesTable.id))
    .where(eq(usersTable.id, req.session.userId!));

  if (!user) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.json(user);
});

router.post("/auth/login", validate(LoginInputSchema), async (req, res): Promise<void> => {
  const { email, password } = req.body;

  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      agencyId: usersTable.agencyId,
      passwordHash: usersTable.passwordHash,
      active: usersTable.active,
      status: usersTable.status,
      emailVerified: usersTable.emailVerified,
      agencyName: agenciesTable.name,
    })
    .from(usersTable)
    .leftJoin(agenciesTable, eq(usersTable.agencyId, agenciesTable.id))
    .where(eq(usersTable.email, email.toLowerCase().trim()));

  if (!user || !user.active) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.agencyId = user.agencyId;
  req.session.email = user.email;
  req.session.name = user.name;
  req.session.status = user.status;
  req.session.emailVerified = user.emailVerified;

  // Auto-accept any pending invitations for this email
  const newlyAcceptedInvites = await db
    .update(invitationsTable)
    .set({ status: "accepted", travelerId: user.id, acceptedAt: new Date() })
    .where(and(
      eq(invitationsTable.email, user.email),
      eq(invitationsTable.status, "pending"),
    ))
    .returning({ tripId: invitationsTable.tripId });

  for (const invite of newlyAcceptedInvites) {
    if (invite.tripId != null) await ensureTripClassificationByDates(user.id, invite.tripId);
  }

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    agencyId: user.agencyId,
    agencyName: user.agencyName,
    status: user.status,
    emailVerified: user.emailVerified,
  });
});

router.post("/auth/register", validate(RegisterInputSchema), async (req, res): Promise<void> => {
  const { email, password, name, inviteCode } = req.body;

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()));

  if (existing) {
    res.status(400).json({ error: "Email already in use" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const approvalToken = crypto.randomBytes(32).toString("hex");
  const emailVerificationToken = crypto.randomBytes(32).toString("hex");
  const [user] = await db
    .insert(usersTable)
    .values({
      email: email.toLowerCase().trim(),
      passwordHash,
      name,
      role: "traveler",
      status: "pending",
      termsAcceptedAt: new Date(),
      approvalToken,
      emailVerified: false,
      emailVerificationToken,
      emailVerificationExpiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
    })
    .returning();

  if (inviteCode && user) {
    const { invitationsTable } = await import("@workspace/db");
    const [invite] = await db
      .select()
      .from(invitationsTable)
      .where(eq(invitationsTable.inviteCode, inviteCode));
    if (invite && invite.status === "pending" && invite.email.toLowerCase() === user.email.toLowerCase()) {
      await db
        .update(invitationsTable)
        .set({ status: "accepted", travelerId: user.id, acceptedAt: new Date() })
        .where(eq(invitationsTable.id, invite.id));
      await ensureTripClassificationByDates(user.id, invite.tripId);
    }
  }

  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.agencyId = user.agencyId ?? null;
  req.session.email = user.email;
  req.session.name = user.name;
  req.session.status = user.status;
  req.session.emailVerified = user.emailVerified;

  sendApprovalRequestEmail({
    to: ADMIN_NOTIFICATION_EMAIL,
    name: user.name,
    email: user.email,
    role: user.role,
    registeredAt: user.createdAt,
    approveUrl: `${PUBLIC_APP_URL}/api/auth/approve?token=${approvalToken}&action=approved`,
    rejectUrl: `${PUBLIC_APP_URL}/api/auth/approve?token=${approvalToken}&action=rejected`,
  }).catch((err) => console.error("Failed to send approval request email", err));

  sendEmailVerificationEmail({
    to: user.email,
    name: user.name,
    verifyUrl: `${PUBLIC_APP_URL}/api/auth/verify-email?token=${emailVerificationToken}`,
  }).catch((err) => console.error("Failed to send email verification email", err));

  res.status(201).json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    agencyId: user.agencyId,
    agencyName: null,
    status: user.status,
    emailVerified: user.emailVerified,
  });
});

router.get("/auth/approve", async (req, res): Promise<void> => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const action = req.query.action === "approved" || req.query.action === "rejected" ? req.query.action : null;

  if (!token || !action) {
    res.status(400).send(renderInfoPage("Enlace inválido", "El enlace de aprobación no es válido."));
    return;
  }

  const [user] = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.approvalToken, token));

  if (!user) {
    res.status(400).send(renderInfoPage("Enlace ya utilizado", "Este enlace ya fue usado o no es válido."));
    return;
  }

  await db
    .update(usersTable)
    .set({ status: action, approvalToken: null })
    .where(eq(usersTable.id, user.id));

  res.send(
    action === "approved"
      ? renderInfoPage("Usuario aprobado", `${user.name} ya puede acceder a Lugendo.`)
      : renderInfoPage("Usuario rechazado", `Se ha rechazado el acceso de ${user.name}.`),
  );
});

router.get("/auth/verify-email", async (req, res): Promise<void> => {
  const token = typeof req.query.token === "string" ? req.query.token : "";

  if (!token) {
    res.status(400).send(renderInfoPage("Enlace inválido", "El enlace de verificación no es válido."));
    return;
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      emailVerificationExpiresAt: usersTable.emailVerificationExpiresAt,
    })
    .from(usersTable)
    .where(eq(usersTable.emailVerificationToken, token));

  if (!user || !user.emailVerificationExpiresAt || user.emailVerificationExpiresAt.getTime() < Date.now()) {
    res.status(400).send(renderInfoPage(
      "Enlace caducado",
      "Este enlace de verificación ya no es válido. Inicia sesión y solicita uno nuevo desde tu cuenta.",
    ));
    return;
  }

  await db
    .update(usersTable)
    .set({ emailVerified: true, emailVerificationToken: null, emailVerificationExpiresAt: null })
    .where(eq(usersTable.id, user.id));

  // If this link is opened in the same browser/session that registered, unblock it
  // immediately without requiring a fresh login.
  if (req.session.userId === user.id) {
    req.session.emailVerified = true;
  }

  res.send(renderInfoPage("Email verificado", `${user.name}, tu email ha sido confirmado. Ya puedes usar Lugendo.`));
});

router.post("/auth/resend-verification", requireSession, async (req, res): Promise<void> => {
  const [user] = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, emailVerified: usersTable.emailVerified })
    .from(usersTable)
    .where(eq(usersTable.id, req.session.userId!));

  if (!user || user.emailVerified) {
    res.sendStatus(204);
    return;
  }

  const emailVerificationToken = crypto.randomBytes(32).toString("hex");
  await db
    .update(usersTable)
    .set({ emailVerificationToken, emailVerificationExpiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS) })
    .where(eq(usersTable.id, user.id));

  sendEmailVerificationEmail({
    to: user.email,
    name: user.name,
    verifyUrl: `${PUBLIC_APP_URL}/api/auth/verify-email?token=${emailVerificationToken}`,
  }).catch((err) => console.error("Failed to send email verification email", err));

  res.sendStatus(204);
});

router.post("/auth/forgot-password", validate(ForgotPasswordInputSchema), async (req, res): Promise<void> => {
  const { email } = req.body;

  const [user] = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()));

  // Always respond 204 regardless of whether the account exists, to avoid leaking
  // account existence to an unauthenticated caller.
  if (user) {
    const passwordResetToken = crypto.randomBytes(32).toString("hex");
    await db
      .update(usersTable)
      .set({ passwordResetToken, passwordResetExpiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) })
      .where(eq(usersTable.id, user.id));

    sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl: `${PUBLIC_APP_URL}/reset-password?token=${passwordResetToken}`,
    }).catch((err) => console.error("Failed to send password reset email", err));
  }

  res.sendStatus(204);
});

router.post("/auth/reset-password", validate(ResetPasswordInputSchema), async (req, res): Promise<void> => {
  const { token, password } = req.body;

  const [user] = await db
    .select({ id: usersTable.id, passwordResetExpiresAt: usersTable.passwordResetExpiresAt })
    .from(usersTable)
    .where(eq(usersTable.passwordResetToken, token));

  if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt.getTime() < Date.now()) {
    res.status(400).json({ error: "Invalid or expired token" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await db
    .update(usersTable)
    .set({ passwordHash, passwordResetToken: null, passwordResetExpiresAt: null })
    .where(eq(usersTable.id, user.id));

  await invalidateOtherSessions(user.id, req.sessionID);

  res.sendStatus(204);
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  req.session.destroy(() => {});
  res.sendStatus(204);
});

export default router;
