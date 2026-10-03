const nodemailer = require('nodemailer');

function createEmailService(env = process.env) {
  const smtpKeys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM'];
  const hasCompleteSmtp = smtpKeys.every((key) => env[key]);
  const mode = env.EMAIL_MODE || (hasCompleteSmtp ? 'smtp' : 'preview');

  if (!['preview', 'smtp'].includes(mode)) {
    throw new Error('EMAIL_MODE must be preview or smtp');
  }
  if ((env.NODE_ENV === 'production' || mode === 'smtp') && !hasCompleteSmtp) {
    throw new Error('Incomplete SMTP configuration: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS and EMAIL_FROM are required');
  }

  const transporter = mode === 'smtp' && hasCompleteSmtp
    ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT),
      secure: String(env.SMTP_SECURE).toLowerCase() === 'true',
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      disableFileAccess: true,
      disableUrlAccess: true
    })
    : null;

  async function send(message) {
    if (!transporter) {
      console.info(`[email-preview] To: ${message.to}; Subject: ${message.subject}`);
      return { delivered: false, mode: 'preview' };
    }
    await transporter.sendMail({ from: env.EMAIL_FROM, ...message });
    return { delivered: true, mode: 'smtp' };
  }

  return {
    sendWelcome(user) {
      return send({
        to: user.email,
        subject: 'Welcome to Virtual Event Management',
        text: `Hello ${user.name}, your ${user.role} account is ready.`
      });
    },
    sendEventConfirmation(user, event) {
      return send({
        to: user.email,
        subject: `Registration confirmed: ${event.title}`,
        text: `You are registered for ${event.title}.\nDate: ${event.date} UTC\nTime: ${event.time} UTC\n\n${event.description}`
      });
    }
  };
}

module.exports = { createEmailService };
