const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

async function api(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${method} ${path} returned ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

async function main() {
  const suffix = `${Date.now()}@example.com`;
  const password = 'smoke-password-123';
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const date = future.toISOString().slice(0, 10);

  await api('/health');
  await api('/register', { method: 'POST', body: { name: 'Smoke Organizer', email: `organizer-${suffix}`, password, role: 'organizer' } });
  const organizerLogin = await api('/login', { method: 'POST', body: { email: `organizer-${suffix}`, password } });
  const created = await api('/events', {
    method: 'POST',
    token: organizerLogin.data.token,
    body: { title: 'Smoke Test Event', description: 'Created by the automated local smoke test.', date, time: '23:59' }
  });
  await api('/register', { method: 'POST', body: { name: 'Smoke Attendee', email: `attendee-${suffix}`, password, role: 'attendee' } });
  const attendeeLogin = await api('/login', { method: 'POST', body: { email: `attendee-${suffix}`, password } });
  await api(`/events/${created.data.event.id}/register`, { method: 'POST', token: attendeeLogin.data.token });
  const registrations = await api('/me/registrations', { token: attendeeLogin.data.token });
  if (registrations.data.events.length !== 1) throw new Error('Registration list did not contain the event');
  console.log(`Smoke test passed against ${baseUrl}: health -> register -> login -> create -> attendee register -> list`);
}

main().catch((error) => {
  console.error(`Smoke test failed: ${error.message}`);
  process.exit(1);
});
