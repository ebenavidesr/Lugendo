import { db } from "@workspace/db";
import { emailSendLogTable } from "@workspace/db";
import type { EmailSendLog } from "@workspace/db";

if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY env var is required");
}

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM_ADDRESS || "Lugendo <hola@lugendo.io>";
const EMAIL_FROM_NOREPLY = process.env.EMAIL_FROM_NOREPLY_ADDRESS || "Lugendo <no-reply@lugendo.io>";

type EmailType = EmailSendLog["type"];

// Every send (including the pre-existing invitation/document/approval emails) goes through
// this wrapper so the email_send_log table has a complete record for debugging/auditing,
// per the DoD in tarea #145 — not just the newly added email types.
async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  type: EmailType;
  from?: string;
  tripId?: number;
}): Promise<void> {
  const { to, subject, html, type, from, tripId } = opts;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from: from ?? EMAIL_FROM, to, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend error ${res.status}: ${body}`);
    }
    await db.insert(emailSendLogTable).values({ type, recipientEmail: to, relatedTripId: tripId ?? null, status: "sent" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.insert(emailSendLogTable).values({ type, recipientEmail: to, relatedTripId: tripId ?? null, status: "failed", errorMessage: message });
    throw err;
  }
}

// Single reusable template for all emails: title + body + one optional CTA, with brand
// colors (Arena/Terracota/Noche/Duna). Emails with a bespoke layout that predate this task
// (approval request's two buttons, document upload's file chip) keep their own markup below
// but still funnel through sendEmail() so every send is logged the same way.
function renderBaseTemplate(opts: {
  title: string;
  bodyHtml: string;
  ctaText?: string;
  ctaUrl?: string;
  showFooter?: boolean;
}): string {
  const { title, bodyHtml, ctaText, ctaUrl, showFooter = false } = opts;
  const cta = ctaText && ctaUrl
    ? `<a href="${ctaUrl}" style="display:block;background:#C4793A;color:#FAF2EB;text-align:center;padding:14px 24px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:500;margin-top:8px">${ctaText} →</a>`
    : "";
  const footer = showFooter
    ? `<p style="margin:24px 0 0;font-size:12px;color:#9C7A58;text-align:center">Puedes gestionar tus preferencias de notificación desde tu cuenta Lugendo.</p>`
    : "";
  return `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:560px;margin:0 auto;color:#2D1F0E">
      <div style="background:#FAF2EB;padding:32px;border-radius:16px">
        <p style="margin:0 0 20px;font-size:13px;color:#C4793A;font-weight:500;letter-spacing:.02em">Lugendo</p>
        <h1 style="margin:0 0 16px;font-size:20px;font-weight:500">${title}</h1>
        <div style="font-size:15px;color:#6B5744;line-height:1.5">${bodyHtml}</div>
        ${cta}
        ${footer}
      </div>
    </div>
  `;
}

export async function sendEmailVerificationEmail(opts: {
  to: string;
  name: string;
  verifyUrl: string;
}): Promise<void> {
  const { to, name, verifyUrl } = opts;
  await sendEmail({
    to,
    from: EMAIL_FROM_NOREPLY,
    type: "welcome_verification",
    subject: "Confirma tu email para empezar tu viaje",
    html: renderBaseTemplate({
      title: `Hola, ${name}`,
      bodyHtml: `
        <p style="margin:0 0 16px">Ya casi está. Confirma tu email y tu cuenta estará lista.</p>
        <p style="margin:0;font-size:12px;color:#9C7A58">Si el botón no funciona, copia este enlace: ${verifyUrl}</p>
        <p style="margin:8px 0 0;font-size:12px;color:#9C7A58">Este enlace caduca en 24 horas.</p>
      `,
      ctaText: "Verificar mi email",
      ctaUrl: verifyUrl,
    }),
  });
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  name: string;
  resetUrl: string;
}): Promise<void> {
  const { to, name, resetUrl } = opts;
  await sendEmail({
    to,
    from: EMAIL_FROM_NOREPLY,
    type: "password_reset",
    subject: "Recupera tu contraseña en Lugendo",
    html: renderBaseTemplate({
      title: `Hola, ${name}`,
      bodyHtml: `
        <p style="margin:0 0 16px">Hemos recibido una solicitud para restablecer tu contraseña.</p>
        <p style="margin:0;font-size:12px;color:#9C7A58">Si el botón no funciona, copia este enlace: ${resetUrl}</p>
        <p style="margin:8px 0 0;font-size:12px;color:#9C7A58">Este enlace caduca en 1 hora. Si no fuiste tú, ignora este email.</p>
      `,
      ctaText: "Restablecer contraseña",
      ctaUrl: resetUrl,
    }),
  });
}

export async function sendInvitationEmail(opts: {
  to: string;
  agencyName: string;
  tripName: string;
  inviteCode: string;
  registerUrl: string;
  tripId?: number;
}): Promise<void> {
  const { to, agencyName, tripName, inviteCode, registerUrl, tripId } = opts;
  await sendEmail({
    to,
    type: "trip_invitation",
    tripId,
    subject: `${agencyName} te invita al viaje: ${tripName}`,
    html: renderBaseTemplate({
      title: `${agencyName} te invita a un viaje`,
      showFooter: true,
      bodyHtml: `
        <div style="background:#fff;border-radius:12px;padding:20px 24px;margin-bottom:20px">
          <p style="margin:0 0 4px;font-size:13px;color:#9C7A58;text-transform:uppercase;letter-spacing:.05em">Viaje</p>
          <p style="margin:0;font-size:18px;font-weight:500;color:#2D1F0E">${tripName}</p>
        </div>
        <div style="background:#ECD5B8;border-radius:12px;padding:16px 24px;margin-bottom:20px;text-align:center">
          <p style="margin:0 0 4px;font-size:12px;color:#6B5744;text-transform:uppercase;letter-spacing:.08em">Tu código de acceso</p>
          <p style="margin:0;font-size:28px;font-weight:500;letter-spacing:.2em;color:#3D2F6B">${inviteCode}</p>
        </div>
        <p style="margin:0;font-size:13px;color:#6B5744">Si ya tienes cuenta, inicia sesión e introduce el código. Si no, regístrate con este email.</p>
      `,
      ctaText: "Unirme al viaje",
      ctaUrl: registerUrl,
    }),
  });
}

// Traveler-to-traveler share (trip_shares table) — distinct from the agency-driven
// invitation above (invitations table). The recipient may or may not have a Lugendo
// account yet; ctaUrl/ctaText are chosen by the caller accordingly (login vs. register).
export async function sendTripShareInvitationEmail(opts: {
  to: string;
  ownerName: string;
  tripName: string;
  shareCode: string;
  ctaText: string;
  ctaUrl: string;
  tripId?: number;
}): Promise<void> {
  const { to, ownerName, tripName, shareCode, ctaText, ctaUrl, tripId } = opts;
  await sendEmail({
    to,
    type: "trip_share_invitation",
    tripId,
    subject: `${ownerName} te ha compartido su viaje: ${tripName}`,
    html: renderBaseTemplate({
      title: `${ownerName} te ha compartido un viaje`,
      showFooter: true,
      bodyHtml: `
        <div style="background:#fff;border-radius:12px;padding:20px 24px;margin-bottom:20px">
          <p style="margin:0 0 4px;font-size:13px;color:#9C7A58;text-transform:uppercase;letter-spacing:.05em">Viaje</p>
          <p style="margin:0;font-size:18px;font-weight:500;color:#2D1F0E">${tripName}</p>
        </div>
        <div style="background:#ECD5B8;border-radius:12px;padding:16px 24px;margin-bottom:20px;text-align:center">
          <p style="margin:0 0 4px;font-size:12px;color:#6B5744;text-transform:uppercase;letter-spacing:.08em">Código de invitación</p>
          <p style="margin:0;font-size:28px;font-weight:500;letter-spacing:.2em;color:#3D2F6B">${shareCode}</p>
        </div>
        <p style="margin:0;font-size:13px;color:#6B5744">Entra a Lugendo e introduce este código desde "¿Tienes un código de invitación?" en tu pantalla de inicio para ver el viaje.</p>
      `,
      ctaText,
      ctaUrl,
    }),
  });
}

export async function sendWelcomeEmail(opts: {
  to: string;
  name: string;
  tripName: string;
  agencyName: string;
}): Promise<void> {
  const { to, name, tripName, agencyName } = opts;
  await sendEmail({
    to,
    type: "welcome_verification",
    subject: `¡Bienvenido a Lugendo! Tu viaje "${tripName}" está listo`,
    html: renderBaseTemplate({
      title: `¡Hola, ${name}!`,
      showFooter: true,
      bodyHtml: `
        <p style="margin:0 0 16px">
          Has aceptado la invitación de <strong>${agencyName}</strong> para unirte al viaje
          <strong>${tripName}</strong>. Ya puedes acceder a todos los detalles en tu Passport.
        </p>
        <p style="margin:0;font-size:13px;color:#9C7A58">¡Buen viaje!</p>
      `,
    }),
  });
}

export async function sendDocumentUploadedEmail(opts: {
  to: string;
  travelerName: string | null;
  tripName: string;
  agencyName: string;
  documentName: string;
  tripUrl: string;
  tripId?: number;
}): Promise<void> {
  const { to, travelerName, tripName, agencyName, documentName, tripUrl, tripId } = opts;
  const greeting = travelerName ? `Hola <strong>${travelerName}</strong>,` : "Hola,";
  await sendEmail({
    to,
    type: "document_uploaded",
    tripId,
    subject: `Nuevo documento en tu viaje "${tripName}"`,
    html: renderBaseTemplate({
      title: "Nuevo documento disponible",
      showFooter: true,
      bodyHtml: `
        <p style="margin:0 0 8px">${greeting}</p>
        <p style="margin:0 0 16px"><strong>${agencyName}</strong> ha añadido un documento a tu viaje <strong>${tripName}</strong>:</p>
        <div style="background:#fff;border-radius:10px;padding:16px 20px;margin-bottom:8px;font-size:15px;color:#2D1F0E;display:flex;align-items:center;gap:12px">
          <span style="font-size:20px">📄</span>
          <span style="font-weight:500">${documentName}</span>
        </div>
      `,
      ctaText: "Ver documentos",
      ctaUrl: tripUrl,
    }),
  });
}

export async function sendApprovalRequestEmail(opts: {
  to: string;
  name: string;
  email: string;
  role: string;
  registeredAt: Date;
  approveUrl: string;
  rejectUrl: string;
}): Promise<void> {
  const { to, name, email, role, registeredAt, approveUrl, rejectUrl } = opts;
  const formattedDate = registeredAt.toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
  await sendEmail({
    to,
    type: "approval_request",
    subject: `Nuevo registro pendiente de aprobación: ${name}`,
    html: `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:560px;margin:0 auto;color:#2D1F0E">
      <div style="background:#FAF2EB;padding:32px;border-radius:16px">
        <h1 style="margin:0 0 16px;font-size:20px;font-weight:500">Nuevo registro en Lugendo</h1>
        <div style="background:#fff;border-radius:10px;padding:16px 20px;margin-bottom:24px;font-size:14px;color:#2D1F0E">
          <p style="margin:0 0 6px"><strong>Nombre:</strong> ${name}</p>
          <p style="margin:0 0 6px"><strong>Email:</strong> ${email}</p>
          <p style="margin:0 0 6px"><strong>Rol:</strong> ${role}</p>
          <p style="margin:0"><strong>Fecha:</strong> ${formattedDate}</p>
        </div>
        <div style="display:flex;gap:12px">
          <a href="${approveUrl}" style="flex:1;display:block;background:#3D2F6B;color:#FAF2EB;text-align:center;padding:14px 20px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:500">
            Aprobar
          </a>
          <a href="${rejectUrl}" style="flex:1;display:block;background:#C4793A;color:#FAF2EB;text-align:center;padding:14px 20px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:500">
            Rechazar
          </a>
        </div>
        <p style="margin:16px 0 0;font-size:12px;color:#9C7A58;text-align:center">
          El enlace es de un solo uso.
        </p>
      </div>
    </div>
    `,
  });
}

export async function sendTripUpdatedEmail(opts: {
  to: string;
  name: string;
  tripName: string;
  agencyName: string;
  changeDescription: string;
  tripUrl: string;
  tripId?: number;
}): Promise<void> {
  const { to, name, tripName, agencyName, changeDescription, tripUrl, tripId } = opts;
  await sendEmail({
    to,
    type: "trip_updated",
    tripId,
    subject: `Hay novedades en tu viaje a ${tripName}`,
    html: renderBaseTemplate({
      title: "Hay cambios en tu viaje",
      showFooter: true,
      bodyHtml: `
        <p style="margin:0 0 8px">Hola <strong>${name}</strong>,</p>
        <p style="margin:0 0 16px"><strong>${agencyName}</strong> ha actualizado el viaje <strong>${tripName}</strong>:</p>
        <div style="background:#fff;border-radius:10px;padding:16px 20px;margin-bottom:8px;font-size:14px;color:#2D1F0E">
          ${changeDescription}
        </div>
      `,
      ctaText: "Ver mi itinerario",
      ctaUrl: tripUrl,
    }),
  });
}

export async function sendAgencyOnboardingEmail(opts: {
  to: string;
  name: string;
  agencyName: string;
  activateUrl: string;
}): Promise<void> {
  const { to, name, agencyName, activateUrl } = opts;
  await sendEmail({
    to,
    type: "agency_onboarding",
    subject: `Bienvenido a Lugendo, ${name}`,
    html: renderBaseTemplate({
      title: `¡Hola, ${name}!`,
      bodyHtml: `
        <p style="margin:0 0 16px">Se ha creado tu cuenta de <strong>${agencyName}</strong> en Lugendo. Activa tu acceso eligiendo una contraseña.</p>
        <p style="margin:0;font-size:12px;color:#9C7A58">Este enlace caduca en 1 hora.</p>
      `,
      ctaText: "Activar mi cuenta",
      ctaUrl: activateUrl,
    }),
  });
}

export async function sendTripReminderEmail(opts: {
  to: string;
  name: string;
  tripName: string;
  daysUntil: 7 | 3;
  pendingItems: string[];
  tripUrl: string;
  tripId: number;
}): Promise<void> {
  const { to, name, tripName, daysUntil, pendingItems, tripUrl, tripId } = opts;
  const pendingHtml = pendingItems.length > 0
    ? `
      <p style="margin:0 0 8px">Todavía tienes estas tareas pendientes antes de viajar:</p>
      <ul style="margin:0 0 16px;padding-left:20px;background:#fff;border-radius:10px;padding:16px 20px 16px 36px;font-size:14px;color:#2D1F0E">
        ${pendingItems.map((item) => `<li style="margin-bottom:4px">${item}</li>`).join("")}
      </ul>
    `
    : `<p style="margin:0 0 16px">¡Ya tienes todo listo para el viaje! 🎒</p>`;
  await sendEmail({
    to,
    type: daysUntil === 7 ? "trip_reminder_7d" : "trip_reminder_3d",
    tripId,
    subject: `Tu viaje a ${tripName} empieza en ${daysUntil} días`,
    html: renderBaseTemplate({
      title: `${tripName} está cerca`,
      showFooter: true,
      bodyHtml: `
        <p style="margin:0 0 8px">Hola <strong>${name}</strong>,</p>
        <p style="margin:0 0 16px">Faltan <strong>${daysUntil} días</strong> para tu viaje.</p>
        ${pendingHtml}
      `,
      ctaText: "Ver mi checklist",
      ctaUrl: tripUrl,
    }),
  });
}
