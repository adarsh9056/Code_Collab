import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

let transporter = null;

function getTransporter() {
  if (transporter !== null) return transporter;
  const user = (config.smtpUser || '').trim();
  const pass = config.smtpPass || '';
  if (!user || !pass) return null;
  transporter = nodemailer.createTransport({
    host: config.smtpHost || 'smtp.gmail.com',
    port: Number(config.smtpPort) || 587,
    secure: config.smtpSecure === 'true',
    auth: { user, pass },
  });
  return transporter;
}

/** Call once at startup to log email status */
export function logEmailStatus() {
  const trans = getTransporter();
  if (trans) {
    console.log('[Email] SMTP configured — OTP emails will be sent to users.');
    return;
  }
  console.log('[Email] SMTP not configured (set SMTP_USER and SMTP_PASS in backend/.env). OTP will be printed in the server console when you click Send OTP.');
}

/**
 * Send OTP email via SMTP. If SMTP is not configured, logs OTP to console (for dev).
 * Returns { sentViaEmail: true } if sent by SMTP, { sentViaEmail: false } if only logged.
 */
export async function sendOtpEmail(toEmail, otp) {
  const subject = 'Your CodeCollab verification code';
  const text = `Your verification code is: ${otp}\n\nIt expires in 10 minutes.\n\nIf you didn't request this, please ignore this email.`;
  const html = `
    <p>Your verification code is: <strong>${otp}</strong></p>
    <p>It expires in 10 minutes.</p>
    <p>If you didn't request this, please ignore this email.</p>
  `;

  const trans = getTransporter();
  if (!trans) {
    console.log('[Email] OTP for', toEmail, ':', otp, '(Set SMTP_USER and SMTP_PASS in backend/.env to send real emails — see RUN_INSTRUCTIONS.md)');
    return { sentViaEmail: false };
  }
  const from = (config.emailFrom || config.smtpUser || 'noreply@codecollab.local').trim();
  try {
    await trans.sendMail({ from, to: toEmail, subject, text, html });
    console.log('[Email] OTP sent to', toEmail);
    return { sentViaEmail: true };
  } catch (err) {
    console.error('[Email] Send failed:', err.message);
    if (err.code === 'EAUTH') {
      throw new Error('Email login failed. For Gmail, use an App Password (https://myaccount.google.com/apppasswords), not your normal password.');
    }
    if (err.code === 'ESOCKET' || err.code === 'ECONNECTION' || err.code === 'ETIMEDOUT') {
      throw new Error('Could not connect to email server. Check SMTP_HOST, SMTP_PORT and your network.');
    }
    throw new Error(err.message || 'Failed to send email');
  }
}
