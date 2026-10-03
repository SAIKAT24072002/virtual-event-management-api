const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { users } = require('../store');
const { validateRegistration, validateLogin } = require('../validation');
const { safeUser } = require('../utils/serializers');
const ApiError = require('../utils/api-error');

function createAuthController({ emailService, jwtSecret, jwtExpiresIn }) {
  return {
    async register(req, res) {
      const input = validateRegistration(req.body);
      const duplicate = [...users.values()].some((user) => user.email === input.email);
      if (duplicate) throw new ApiError(409, 'An account with this email already exists');
      const user = {
        id: crypto.randomUUID(),
        name: input.name,
        email: input.email,
        passwordHash: await bcrypt.hash(input.password, 10),
        role: input.role,
        createdAt: new Date().toISOString()
      };
      users.set(user.id, user);
      let notification;
      try {
        const result = await emailService.sendWelcome(user);
        notification = result.delivered
          ? { status: 'sent' }
          : { status: 'preview', message: 'Email was previewed locally and not delivered' };
      } catch (error) {
        console.error('Welcome email failed:', error.message);
        notification = { status: 'failed', message: 'Account created, but welcome email could not be sent' };
      }
      res.status(201).json({ success: true, data: { user: safeUser(user), notification } });
    },

    async login(req, res) {
      const input = validateLogin(req.body);
      const user = [...users.values()].find((candidate) => candidate.email === input.email);
      if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
        throw new ApiError(401, 'Invalid email or password');
      }
      const token = jwt.sign({ role: user.role }, jwtSecret, { subject: user.id, expiresIn: jwtExpiresIn });
      res.json({ success: true, data: { token, expiresIn: jwtExpiresIn, user: safeUser(user) } });
    },

    me(req, res) {
      res.json({ success: true, data: { user: safeUser(req.user) } });
    }
  };
}

module.exports = { createAuthController };
