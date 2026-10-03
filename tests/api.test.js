process.env.NODE_ENV = 'test';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { users, events, resetStore } = require('../src/store');
const { createEmailService, BREVO_ENDPOINT } = require('../src/services/email-service');

const SECRET = 'test-secret-that-is-long-enough-for-tests';
const FUTURE_EVENT = {
  title: 'Future Tech Summit',
  description: 'A virtual event about practical technology.',
  date: '2099-06-15',
  time: '14:30'
};

let emailService;
let app;

async function register(data = {}) {
  return request(app).post('/register').send({
    name: 'Test User',
    email: 'user@example.com',
    password: 'password123',
    role: 'attendee',
    ...data
  });
}

async function tokenFor(role = 'attendee', email = `${role}@example.com`) {
  const response = await register({ name: role, email, role });
  const login = await request(app).post('/login').send({ email, password: 'password123' });
  return { token: login.body.data.token, user: response.body.data.user };
}

async function createEvent(token, input = FUTURE_EVENT) {
  return request(app).post('/events').set('Authorization', `Bearer ${token}`).send(input);
}

beforeEach(() => {
  resetStore();
  emailService = {
    sendWelcome: jest.fn().mockResolvedValue({ accepted: true, provider: 'brevo', messageId: 'welcome-id' }),
    sendEventConfirmation: jest.fn().mockResolvedValue({ accepted: true, provider: 'brevo', messageId: 'event-id' })
  };
  app = createApp({ jwtSecret: SECRET, jwtExpiresIn: '1h', emailService });
});

describe('health and errors', () => {
  test('serves root, health, OpenAPI and documentation', async () => {
    expect((await request(app).get('/')).status).toBe(200);
    expect((await request(app).get('/health')).body.data.status).toBe('ok');
    expect((await request(app).get('/openapi.json')).body.openapi).toBe('3.0.3');
    expect((await request(app).get('/docs/')).status).toBe(200);
  });

  test('handles unknown routes and malformed JSON', async () => {
    expect((await request(app).get('/missing')).status).toBe(404);
    const malformed = await request(app).post('/register').set('Content-Type', 'application/json').send('{bad');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.message).toMatch(/Malformed JSON/);
  });

  test('rejects oversized JSON bodies', async () => {
    const response = await request(app).post('/register').send({ name: 'x'.repeat(110000) });
    expect(response.status).toBe(413);
  });
});

describe('email configuration', () => {
  const brevoEnv = {
    BREVO_API_KEY: 'test-api-key',
    EMAIL_FROM: 'verified@example.com',
    EMAIL_FROM_NAME: 'Virtual Events'
  };

  test('sends a welcome email through Brevo and reports acceptance, not delivery', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      status: 201,
      json: jest.fn().mockResolvedValue({ messageId: '<welcome@brevo>' })
    });
    const service = createEmailService(brevoEnv, fetchMock);
    await expect(service.sendWelcome({ name: 'Asha', email: 'asha@example.com', role: 'attendee' }))
      .resolves.toEqual({ accepted: true, provider: 'brevo', messageId: '<welcome@brevo>' });

    expect(fetchMock).toHaveBeenCalledWith(BREVO_ENDPOINT, expect.objectContaining({ method: 'POST' }));
    const options = fetchMock.mock.calls[0][1];
    expect(options.headers['api-key']).toBe('test-api-key');
    const body = JSON.parse(options.body);
    expect(body.sender).toEqual({ email: 'verified@example.com', name: 'Virtual Events' });
    expect(body.to).toEqual([{ email: 'asha@example.com', name: 'Asha' }]);
    expect(body.subject).toBe('Welcome to Virtual Event Management');
    expect(body.textContent).toContain('attendee account is ready');
  });

  test('event confirmation contains event title, date, time and description', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      status: 201,
      json: jest.fn().mockResolvedValue({ messageId: '<event@brevo>' })
    });
    const service = createEmailService(brevoEnv, fetchMock);
    await service.sendEventConfirmation(
      { name: 'Guest', email: 'guest@example.com' },
      { title: 'Summit', date: '2099-06-15', time: '14:30', description: 'Practical sessions.' }
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.subject).toBe('Registration confirmed: Summit');
    expect(body.textContent).toContain('Summit');
    expect(body.textContent).toContain('2099-06-15');
    expect(body.textContent).toContain('14:30 UTC');
    expect(body.textContent).toContain('Practical sessions.');
  });

  test('rejects incomplete Brevo configuration', () => {
    expect(() => createEmailService({})).toThrow(/BREVO_API_KEY, EMAIL_FROM, EMAIL_FROM_NAME required/);
  });

  test('handles Brevo rejection without exposing the API key', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ status: 401, json: jest.fn() });
    const service = createEmailService(brevoEnv, fetchMock);
    await expect(service.sendWelcome({ name: 'Asha', email: 'asha@example.com', role: 'attendee' }))
      .rejects.toThrow('Brevo email request was rejected with status 401');
  });
});

describe('account registration and login', () => {
  test('registers safely, normalizes email, hashes password and sends welcome email', async () => {
    const response = await register({ email: '  USER@Example.COM  ' });
    expect(response.status).toBe(201);
    expect(response.body.data.user.email).toBe('user@example.com');
    expect(response.body.data.user).not.toHaveProperty('passwordHash');
    expect(response.body.data.user).not.toHaveProperty('password');
    expect(response.body.data.notification.status).toBe('accepted');
    expect(response.body.data.notification.message).toMatch(/inbox delivery is not verified/);
    const stored = [...users.values()][0];
    expect(stored.passwordHash).not.toBe('password123');
    expect(await bcrypt.compare('password123', stored.passwordHash)).toBe(true);
    expect(emailService.sendWelcome).toHaveBeenCalledTimes(1);
  });

  test('defaults role to attendee', async () => {
    const response = await request(app).post('/register').send({ name: 'Default Role', email: 'default@example.com', password: 'password123' });
    expect(response.status).toBe(201);
    expect(response.body.data.user.role).toBe('attendee');
  });

  test.each([
    [{ name: '', email: 'good@example.com', password: 'password123' }, 400],
    [{ name: 'Name', email: 'bad-email', password: 'password123' }, 400],
    [{ name: 'Name', email: 'good@example.com', password: 'short' }, 400],
    [{ name: 'Name', email: 'good@example.com', password: 'password123', role: 'admin' }, 400]
  ])('rejects invalid registration %#', async (body, status) => {
    expect((await request(app).post('/register').send(body)).status).toBe(status);
  });

  test('rejects duplicate normalized email', async () => {
    await register();
    const response = await register({ email: ' USER@example.com ' });
    expect(response.status).toBe(409);
  });

  test('logs in with a JWT and rejects a wrong password generically', async () => {
    await register();
    const good = await request(app).post('/login').send({ email: 'USER@example.com', password: 'password123' });
    expect(good.status).toBe(200);
    expect(good.body.data.token.split('.')).toHaveLength(3);
    expect(good.body.data.user).not.toHaveProperty('passwordHash');
    const bad = await request(app).post('/login').send({ email: 'user@example.com', password: 'wrong-password' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.message).toBe('Invalid email or password');
  });

  test('preserves account when welcome email fails', async () => {
    emailService.sendWelcome.mockRejectedValueOnce(new Error('Brevo unavailable'));
    const response = await register();
    expect(response.status).toBe(201);
    expect(response.body.data.notification.status).toBe('failed');
    expect(users.size).toBe(1);
  });
});

describe('authentication', () => {
  test('rejects missing, invalid and expired tokens', async () => {
    expect((await request(app).get('/me')).status).toBe(401);
    expect((await request(app).get('/me').set('Authorization', 'Bearer nonsense')).status).toBe(401);
    const { user } = await tokenFor();
    const expired = jwt.sign({}, SECRET, { subject: user.id, expiresIn: -1 });
    const response = await request(app).get('/me').set('Authorization', `Bearer ${expired}`);
    expect(response.status).toBe(401);
    expect(response.body.error.message).toMatch(/expired/);
  });

  test('returns a safe current profile and verifies token user still exists', async () => {
    const { token, user } = await tokenFor();
    const profile = await request(app).get('/me').set('Authorization', `Bearer ${token}`);
    expect(profile.status).toBe(200);
    expect(profile.body.data.user).not.toHaveProperty('passwordHash');
    users.delete(user.id);
    expect((await request(app).get('/me').set('Authorization', `Bearer ${token}`)).status).toBe(401);
  });

  test('uses the current stored role instead of a stale token role', async () => {
    const { token, user } = await tokenFor('attendee', 'role@example.com');
    users.get(user.id).role = 'organizer';
    const response = await createEvent(token);
    expect(response.status).toBe(201);
  });
});

describe('event CRUD and authorization', () => {
  test('allows organizer creation, listing and details with participantCount', async () => {
    const { token } = await tokenFor('organizer');
    const created = await createEvent(token);
    expect(created.status).toBe(201);
    expect(created.body.data.event.participantCount).toBe(0);
    const id = created.body.data.event.id;
    const list = await request(app).get('/events').set('Authorization', `Bearer ${token}`);
    const detail = await request(app).get(`/events/${id}`).set('Authorization', `Bearer ${token}`);
    expect(list.body.data.events).toHaveLength(1);
    expect(detail.body.data.event.title).toBe(FUTURE_EVENT.title);
  });

  test('rejects attendee event creation', async () => {
    const { token } = await tokenFor('attendee');
    expect((await createEvent(token)).status).toBe(403);
  });

  test('owner can fully replace editable fields while preserving owner and registrations', async () => {
    const owner = await tokenFor('organizer', 'owner@example.com');
    const attendee = await tokenFor('attendee', 'guest@example.com');
    const created = await createEvent(owner.token);
    const id = created.body.data.event.id;
    await request(app).post(`/events/${id}/register`).set('Authorization', `Bearer ${attendee.token}`);
    const replacement = { title: 'Updated', description: 'Updated description', date: '2099-07-01', time: '09:00' };
    const updated = await request(app).put(`/events/${id}`).set('Authorization', `Bearer ${owner.token}`).send(replacement);
    expect(updated.status).toBe(200);
    expect(updated.body.data.event.organizerId).toBe(owner.user.id);
    expect(updated.body.data.event.participantCount).toBe(1);
  });

  test.each(['organizer', 'attendee'])('non-owner %s cannot update or delete', async (role) => {
    const owner = await tokenFor('organizer', 'owner@example.com');
    const outsider = await tokenFor(role, `outsider-${role}@example.com`);
    const id = (await createEvent(owner.token)).body.data.event.id;
    expect((await request(app).put(`/events/${id}`).set('Authorization', `Bearer ${outsider.token}`).send(FUTURE_EVENT)).status).toBe(403);
    expect((await request(app).delete(`/events/${id}`).set('Authorization', `Bearer ${outsider.token}`)).status).toBe(403);
  });

  test('owner deletes an event and missing event returns 404', async () => {
    const owner = await tokenFor('organizer');
    const id = (await createEvent(owner.token)).body.data.event.id;
    expect((await request(app).delete(`/events/${id}`).set('Authorization', `Bearer ${owner.token}`)).status).toBe(200);
    expect((await request(app).get(`/events/${id}`).set('Authorization', `Bearer ${owner.token}`)).status).toBe(404);
  });

  test('rejects invalid dates, times, past schedules and protected fields', async () => {
    const { token } = await tokenFor('organizer');
    expect((await createEvent(token, { ...FUTURE_EVENT, date: '2099-02-30' })).status).toBe(400);
    expect((await createEvent(token, { ...FUTURE_EVENT, time: '24:10' })).status).toBe(400);
    expect((await createEvent(token, { ...FUTURE_EVENT, date: '2000-01-01' })).status).toBe(400);
    expect((await createEvent(token, { ...FUTURE_EVENT, organizerId: 'forged' })).status).toBe(400);
  });
});

describe('event registration and participant management', () => {
  test('registers attendee, invokes email and lists own registration', async () => {
    const owner = await tokenFor('organizer', 'owner@example.com');
    const attendee = await tokenFor('attendee', 'attendee@example.com');
    const id = (await createEvent(owner.token)).body.data.event.id;
    const registration = await request(app).post(`/events/${id}/register`).set('Authorization', `Bearer ${attendee.token}`);
    expect(registration.status).toBe(201);
    expect(registration.body.data.event.participantCount).toBe(1);
    expect(registration.body.data.notification.status).toBe('accepted');
    expect(registration.body.data.notification).not.toHaveProperty('delivered');
    expect(emailService.sendEventConfirmation).toHaveBeenCalledTimes(1);
    const mine = await request(app).get('/me/registrations').set('Authorization', `Bearer ${attendee.token}`);
    expect(mine.body.data.events).toHaveLength(1);
  });

  test('rejects duplicate, nonexistent and past event registration', async () => {
    const owner = await tokenFor('organizer', 'owner@example.com');
    const attendee = await tokenFor('attendee', 'attendee@example.com');
    const id = (await createEvent(owner.token)).body.data.event.id;
    await request(app).post(`/events/${id}/register`).set('Authorization', `Bearer ${attendee.token}`);
    expect((await request(app).post(`/events/${id}/register`).set('Authorization', `Bearer ${attendee.token}`)).status).toBe(409);
    expect((await request(app).post('/events/missing/register').set('Authorization', `Bearer ${attendee.token}`)).status).toBe(404);
    events.get(id).date = '2000-01-01';
    events.get(id).participants = [];
    expect((await request(app).post(`/events/${id}/register`).set('Authorization', `Bearer ${attendee.token}`)).status).toBe(400);
  });

  test('cancels own registration and reports missing cancellation', async () => {
    const owner = await tokenFor('organizer', 'owner@example.com');
    const attendee = await tokenFor('attendee', 'attendee@example.com');
    const id = (await createEvent(owner.token)).body.data.event.id;
    await request(app).post(`/events/${id}/register`).set('Authorization', `Bearer ${attendee.token}`);
    expect((await request(app).delete(`/events/${id}/register`).set('Authorization', `Bearer ${attendee.token}`)).status).toBe(200);
    expect((await request(app).delete(`/events/${id}/register`).set('Authorization', `Bearer ${attendee.token}`)).status).toBe(404);
  });

  test('owner lists safe participants and removes one; outsiders are forbidden', async () => {
    const owner = await tokenFor('organizer', 'owner@example.com');
    const otherOwner = await tokenFor('organizer', 'other@example.com');
    const attendee = await tokenFor('attendee', 'attendee@example.com');
    const id = (await createEvent(owner.token)).body.data.event.id;
    await request(app).post(`/events/${id}/register`).set('Authorization', `Bearer ${attendee.token}`);
    expect((await request(app).get(`/events/${id}/participants`).set('Authorization', `Bearer ${otherOwner.token}`)).status).toBe(403);
    expect((await request(app).get(`/events/${id}/participants`).set('Authorization', `Bearer ${attendee.token}`)).status).toBe(403);
    const list = await request(app).get(`/events/${id}/participants`).set('Authorization', `Bearer ${owner.token}`);
    expect(list.body.data.participants[0]).not.toHaveProperty('passwordHash');
    expect((await request(app).delete(`/events/${id}/participants/${attendee.user.id}`).set('Authorization', `Bearer ${owner.token}`)).status).toBe(200);
    expect((await request(app).delete(`/events/${id}/participants/${attendee.user.id}`).set('Authorization', `Bearer ${owner.token}`)).status).toBe(404);
  });

  test('event deletion removes it from attendee registration results', async () => {
    const owner = await tokenFor('organizer', 'owner@example.com');
    const attendee = await tokenFor('attendee', 'attendee@example.com');
    const id = (await createEvent(owner.token)).body.data.event.id;
    await request(app).post(`/events/${id}/register`).set('Authorization', `Bearer ${attendee.token}`);
    await request(app).delete(`/events/${id}`).set('Authorization', `Bearer ${owner.token}`);
    const mine = await request(app).get('/me/registrations').set('Authorization', `Bearer ${attendee.token}`);
    expect(mine.body.data.events).toEqual([]);
  });

  test('keeps registration when confirmation email fails', async () => {
    const owner = await tokenFor('organizer', 'owner@example.com');
    const attendee = await tokenFor('attendee', 'attendee@example.com');
    const id = (await createEvent(owner.token)).body.data.event.id;
    emailService.sendEventConfirmation.mockRejectedValueOnce(new Error('Brevo unavailable'));
    const response = await request(app).post(`/events/${id}/register`).set('Authorization', `Bearer ${attendee.token}`);
    expect(response.status).toBe(201);
    expect(response.body.data.notification.status).toBe('failed');
    expect(events.get(id).participants).toContain(attendee.user.id);
  });
});
