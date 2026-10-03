const ApiError = require('../utils/api-error');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function assertObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'Request body must be a JSON object');
  }
}

function rejectUnknownFields(body, allowed) {
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    throw new ApiError(400, 'Request contains unsupported fields', { fields: unknown });
  }
}

function requiredString(value, field, { min = 1, max = 1000 } = {}) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw new ApiError(400, `${field} must be a string between ${min} and ${max} characters`);
  }
  return value.trim();
}

function normalizeEmail(value) {
  if (typeof value !== 'string') throw new ApiError(400, 'email must be valid');
  const email = value.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new ApiError(400, 'email must be valid');
  return email;
}

function validateSchedule(date, time, { future = true, now = new Date() } = {}) {
  if (typeof date !== 'string' || !DATE_PATTERN.test(date)) {
    throw new ApiError(400, 'date must use YYYY-MM-DD format');
  }
  if (typeof time !== 'string' || !TIME_PATTERN.test(time)) {
    throw new ApiError(400, 'time must use HH:mm 24-hour format');
  }
  const instant = new Date(`${date}T${time}:00.000Z`);
  if (Number.isNaN(instant.getTime()) || instant.toISOString().slice(0, 10) !== date) {
    throw new ApiError(400, 'date must be a valid calendar date');
  }
  if (future && instant <= now) throw new ApiError(400, 'event schedule must be in the future');
  return instant;
}

function validateRegistration(body) {
  assertObject(body);
  rejectUnknownFields(body, ['name', 'email', 'password', 'role']);
  const name = requiredString(body.name, 'name', { min: 2, max: 100 });
  const email = normalizeEmail(body.email);
  if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) {
    throw new ApiError(400, 'password must be between 8 and 128 characters');
  }
  const role = body.role === undefined ? 'attendee' : body.role;
  if (!['organizer', 'attendee'].includes(role)) throw new ApiError(400, 'role must be organizer or attendee');
  return { name, email, password: body.password, role };
}

function validateLogin(body) {
  assertObject(body);
  rejectUnknownFields(body, ['email', 'password']);
  const email = normalizeEmail(body.email);
  if (typeof body.password !== 'string' || !body.password) throw new ApiError(400, 'password is required');
  return { email, password: body.password };
}

function validateEvent(body) {
  assertObject(body);
  rejectUnknownFields(body, ['title', 'description', 'date', 'time']);
  const title = requiredString(body.title, 'title', { min: 2, max: 200 });
  const description = requiredString(body.description, 'description', { min: 1, max: 5000 });
  validateSchedule(body.date, body.time);
  return { title, description, date: body.date, time: body.time };
}

module.exports = {
  normalizeEmail,
  validateSchedule,
  validateRegistration,
  validateLogin,
  validateEvent
};
