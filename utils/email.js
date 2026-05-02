// ============================================================
//  utils/email.js — Nodemailer Email Sender
//
//  WHY: All email logic lives here. Controllers just call
//  sendPasswordResetEmail(to, token) — they never touch SMTP.
// ============================================================

import nodemailer from "nodemailer";

// Build the transporter once — reuse across all requests
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Sends a password reset email with a tokenised link.
 *
 * @param {string} to    — recipient email address
 * @param {string} token — raw reset token (will be embedded in URL)
 */
export async function sendPasswordResetEmail(to, token) {
  const resetUrl = `${process.env.CLIENT_ORIGIN}/reset-password?token=${token}`;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || "FinTrack <noreply@fintrack.app>",
    to,
    subject: "Reset your FinTrack password",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
        <div style="margin-bottom:24px;">
          <span style="font-size:22px;font-weight:700;color:#10b981;">Fin</span>
          <span style="font-size:22px;font-weight:700;color:#0f172a;">Track</span>
        </div>
        <h2 style="font-size:20px;color:#0f172a;margin-bottom:8px;">Reset your password</h2>
        <p style="color:#475569;line-height:1.6;margin-bottom:24px;">
          We received a request to reset the password for your FinTrack account.
          Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
        </p>
        <a href="${resetUrl}"
           style="display:inline-block;background:#10b981;color:#fff;font-weight:600;
                  padding:12px 28px;border-radius:8px;text-decoration:none;font-size:15px;">
          Reset Password
        </a>
        <p style="color:#94a3b8;font-size:12px;margin-top:32px;">
          If you didn't request this, you can safely ignore this email.<br/>
          This link will expire in 1 hour.
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
        <p style="color:#cbd5e1;font-size:11px;">
          FinTrack · AI Financial Intelligence
        </p>
      </div>
    `,
  });
}

/**
 * Sends a welcome email after successful registration.
 *
 * @param {string} to   — recipient email
 * @param {string} name — user's first name
 */
export async function sendWelcomeEmail(to, name) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || "FinTrack <noreply@fintrack.app>",
    to,
    subject: "Welcome to FinTrack — your 14-day trial has started",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
        <div style="margin-bottom:24px;">
          <span style="font-size:22px;font-weight:700;color:#10b981;">Fin</span>
          <span style="font-size:22px;font-weight:700;color:#0f172a;">Track</span>
        </div>
        <h2 style="font-size:20px;color:#0f172a;margin-bottom:8px;">Welcome, ${name}! 👋</h2>
        <p style="color:#475569;line-height:1.6;margin-bottom:16px;">
          Your 14-day free trial has started. Upload your first bank statement and
          see your business finances clearly — no accounting knowledge required.
        </p>
        <ul style="color:#475569;line-height:2;padding-left:20px;">
          <li>Upload PDF or CSV bank statements</li>
          <li>AI auto-categorises every transaction</li>
          <li>Monthly + annual dashboard with trends</li>
          <li>Financial health recommendations</li>
        </ul>
        <a href="${process.env.CLIENT_ORIGIN}/dashboard"
           style="display:inline-block;margin-top:24px;background:#10b981;color:#fff;
                  font-weight:600;padding:12px 28px;border-radius:8px;
                  text-decoration:none;font-size:15px;">
          Go to Dashboard
        </a>
        <p style="color:#94a3b8;font-size:12px;margin-top:32px;">
          Trial ends in 14 days. No credit card required to start.
        </p>
      </div>
    `,
  });
}