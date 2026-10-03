const express = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../utils/async-handler');

function createAuthRoutes(controller, authenticate) {
  const router = express.Router();
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: process.env.NODE_ENV === 'test' ? 10000 : 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ success: false, error: { message: 'Too many authentication attempts' } })
  });
  router.post('/register', limiter, asyncHandler(controller.register));
  router.post('/login', limiter, asyncHandler(controller.login));
  router.get('/me', authenticate, controller.me);
  return router;
}

module.exports = { createAuthRoutes };
