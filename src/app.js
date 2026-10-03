const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const { createEmailService } = require('./services/email-service');
const { createAuth } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errors');
const { createAuthController } = require('./controllers/auth-controller');
const { createEventController } = require('./controllers/event-controller');
const { createAuthRoutes } = require('./routes/auth-routes');
const { createEventRoutes } = require('./routes/event-routes');
const asyncHandler = require('./utils/async-handler');
const openapi = require('./docs/openapi');
const { requireRole } = require('./middleware/auth');

function createApp(options = {}) {
  const jwtSecret = options.jwtSecret || process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required');
  const jwtExpiresIn = options.jwtExpiresIn || process.env.JWT_EXPIRES_IN || '1h';
  const emailService = options.emailService || createEmailService(process.env);
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  const origin = process.env.CORS_ORIGIN || '*';
  app.use(cors({ origin: origin === '*' ? '*' : origin.split(',').map((value) => value.trim()) }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/', (req, res) => res.json({ success: true, data: { name: 'Virtual Event Management API', status: 'running', documentation: '/docs' } }));
  app.get('/health', (req, res) => res.json({ success: true, data: { status: 'ok', uptimeSeconds: Math.floor(process.uptime()) } }));
  app.get('/openapi.json', (req, res) => res.json(openapi));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

  const authenticate = createAuth(jwtSecret);
  const authController = createAuthController({ emailService, jwtSecret, jwtExpiresIn });
  const eventController = createEventController({ emailService });
  app.use('/', createAuthRoutes(authController, authenticate));
  app.get('/me/registrations', authenticate, requireRole('attendee'), eventController.myRegistrations);
  app.use('/events', createEventRoutes(eventController, authenticate));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
