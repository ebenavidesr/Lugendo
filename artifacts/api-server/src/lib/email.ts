import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const res = await connectors.proxy("resend", "/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Lugendo <noreply@lugendo.io>",
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}

export async function sendInvitationEmail(opts: {
  to: string;
  agencyName: string;
  tripName: string;
  inviteCode: string;
  registerUrl: string;
}): Promise<void> {
  const { to, agencyName, tripName, inviteCode, registerUrl } = opts;
  await sendEmail(
    to,
    `${agencyName} te invita al viaje: ${tripName}`,
    `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:560px;margin:0 auto;color:#2D1F0E">
      <div style="background:#FAF2EB;padding:32px 32px 24px;border-radius:16px">
        <h1 style="margin:0 0 8px;font-size:22px;color:#2D1F0E">${agencyName}</h1>
        <p style="margin:0 0 24px;color:#6B5744;font-size:15px">te ha invitado a unirte al viaje</p>
        <div style="background:#fff;border-radius:12px;padding:20px 24px;margin-bottom:24px">
          <p style="margin:0 0 4px;font-size:13px;color:#9C7A58;text-transform:uppercase;letter-spacing:.05em">Viaje</p>
          <p style="margin:0;font-size:18px;font-weight:600;color:#2D1F0E">${tripName}</p>
        </div>
        <div style="background:#ECD5B8;border-radius:12px;padding:16px 24px;margin-bottom:24px;text-align:center">
          <p style="margin:0 0 4px;font-size:12px;color:#6B5744;text-transform:uppercase;letter-spacing:.08em">Tu código de acceso</p>
          <p style="margin:0;font-size:28px;font-weight:700;letter-spacing:.2em;color:#3D2F6B">${inviteCode}</p>
        </div>
        <a href="${registerUrl}" style="display:block;background:#C4793A;color:#FAF2EB;text-align:center;padding:14px 24px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:600">
          Acceder al viaje →
        </a>
        <p style="margin:16px 0 0;font-size:12px;color:#9C7A58;text-align:center">
          Si ya tienes cuenta, inicia sesión e introduce el código. Si no, regístrate con este email.
        </p>
      </div>
    </div>
    `,
  );
}

export async function sendWelcomeEmail(opts: {
  to: string;
  name: string;
  tripName: string;
  agencyName: string;
}): Promise<void> {
  const { to, name, tripName, agencyName } = opts;
  await sendEmail(
    to,
    `¡Bienvenido a Lugendo! Tu viaje "${tripName}" está listo`,
    `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:560px;margin:0 auto;color:#2D1F0E">
      <div style="background:#FAF2EB;padding:32px;border-radius:16px">
        <h1 style="margin:0 0 16px;font-size:22px">¡Hola, ${name}! 👋</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#6B5744">
          Has aceptado la invitación de <strong>${agencyName}</strong> para unirte al viaje 
          <strong>${tripName}</strong>. Ya puedes acceder a todos los detalles en tu Passport.
        </p>
        <p style="margin:0;font-size:13px;color:#9C7A58">¡Buen viaje!</p>
      </div>
    </div>
    `,
  );
}

export async function sendDocumentUploadedEmail(opts: {
  to: string;
  travelerName: string | null;
  tripName: string;
  agencyName: string;
  documentName: string;
  tripUrl: string;
}): Promise<void> {
  const { to, travelerName, tripName, agencyName, documentName, tripUrl } = opts;
  const greeting = travelerName ? `Hola <strong>${travelerName}</strong>,` : "Hola,";
  await sendEmail(
    to,
    `Nuevo documento en tu viaje "${tripName}"`,
    `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:560px;margin:0 auto;color:#2D1F0E">
      <div style="background:#FAF2EB;padding:32px;border-radius:16px">
        <h1 style="margin:0 0 16px;font-size:20px">Nuevo documento disponible</h1>
        <p style="margin:0 0 8px;font-size:15px;color:#6B5744">${greeting}</p>
        <p style="margin:0 0 16px;font-size:15px;color:#6B5744">
          <strong>${agencyName}</strong> ha añadido un documento a tu viaje <strong>${tripName}</strong>:
        </p>
        <div style="background:#fff;border-radius:10px;padding:16px 20px;margin-bottom:20px;font-size:15px;color:#2D1F0E;display:flex;align-items:center;gap:12px">
          <span style="font-size:20px">📄</span>
          <span style="font-weight:600">${documentName}</span>
        </div>
        <a href="${tripUrl}" style="display:block;background:#C4793A;color:#FAF2EB;text-align:center;padding:14px 24px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:600">
          Ver documentos →
        </a>
        <p style="margin:16px 0 0;font-size:12px;color:#9C7A58;text-align:center">
          Entra a Lugendo Passport para descargarlo y revisarlo.
        </p>
      </div>
    </div>
    `,
  );
}

export async function sendTripUpdatedEmail(opts: {
  to: string;
  name: string;
  tripName: string;
  agencyName: string;
  changeDescription: string;
}): Promise<void> {
  const { to, name, tripName, agencyName, changeDescription } = opts;
  await sendEmail(
    to,
    `Actualización en tu viaje "${tripName}"`,
    `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:560px;margin:0 auto;color:#2D1F0E">
      <div style="background:#FAF2EB;padding:32px;border-radius:16px">
        <h1 style="margin:0 0 16px;font-size:20px">Hay cambios en tu viaje</h1>
        <p style="margin:0 0 8px;font-size:15px;color:#6B5744">Hola <strong>${name}</strong>,</p>
        <p style="margin:0 0 16px;font-size:15px;color:#6B5744">
          <strong>${agencyName}</strong> ha actualizado el viaje <strong>${tripName}</strong>:
        </p>
        <div style="background:#fff;border-radius:10px;padding:16px 20px;margin-bottom:16px;font-size:14px;color:#2D1F0E">
          ${changeDescription}
        </div>
        <p style="margin:0;font-size:13px;color:#9C7A58">Entra a Lugendo para ver el itinerario actualizado.</p>
      </div>
    </div>
    `,
  );
}
