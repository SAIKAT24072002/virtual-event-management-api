const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

function requireConfig(env) {
  const required = ['BREVO_API_KEY', 'EMAIL_FROM', 'EMAIL_FROM_NAME'];
  const missing = required.filter((key) => !env[key] || !env[key].trim());
  if (missing.length) {
    throw new Error(`Incomplete Brevo email configuration: ${missing.join(', ')} required`);
  }
}

function singleLine(value) {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function createEmailService(env = process.env, fetchImpl = globalThis.fetch) {
  requireConfig(env);
  if (typeof fetchImpl !== 'function') throw new Error('A Fetch API implementation is required');

  async function send({ recipient, subject, textContent }) {
    let response;
    try {
      response = await fetchImpl(BREVO_ENDPOINT, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': env.BREVO_API_KEY,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          sender: { email: env.EMAIL_FROM, name: env.EMAIL_FROM_NAME },
          to: [{ email: recipient.email, name: recipient.name }],
          subject: singleLine(subject),
          textContent
        })
      });
    } catch (error) {
      throw new Error('Brevo email request failed');
    }

    if (response.status !== 201) {
      throw new Error(`Brevo email request was rejected with status ${response.status}`);
    }

    let result;
    try {
      result = await response.json();
    } catch (error) {
      result = {};
    }

    return {
      accepted: true,
      provider: 'brevo',
      messageId: typeof result.messageId === 'string' ? result.messageId : null
    };
  }

  return {
    sendWelcome(user) {
      return send({
        recipient: { email: user.email, name: user.name },
        subject: 'Welcome to Virtual Event Management',
        textContent: `Hello ${user.name}, your ${user.role} account is ready.`
      });
    },
    sendEventConfirmation(user, event) {
      return send({
        recipient: { email: user.email, name: user.name },
        subject: `Registration confirmed: ${event.title}`,
        textContent: `You are registered for ${event.title}.\nDate: ${event.date} UTC\nTime: ${event.time} UTC\n\n${event.description}`
      });
    }
  };
}

module.exports = { createEmailService, BREVO_ENDPOINT };
