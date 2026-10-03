module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Virtual Event Management API',
    version: '1.0.0',
    description: 'In-memory API for organizer-managed virtual events. Event dates and times are UTC.'
  },
  servers: [{ url: '/', description: 'Current server' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Credentials: {
        type: 'object', required: ['email', 'password'],
        properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password' } }
      },
      EventInput: {
        type: 'object', required: ['title', 'description', 'date', 'time'], additionalProperties: false,
        properties: {
          title: { type: 'string', example: 'Node.js Summit' },
          description: { type: 'string', example: 'A practical virtual conference.' },
          date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', example: '2099-08-20' },
          time: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$', example: '14:30' }
        }
      }
    }
  },
  paths: {
    '/': { get: { summary: 'API information', responses: { 200: { description: 'API information' } } } },
    '/health': { get: { summary: 'Health check', responses: { 200: { description: 'Service is healthy' } } } },
    '/register': {
      post: {
        summary: 'Create an organizer or attendee account',
        requestBody: { required: true, content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/Credentials' }, { type: 'object', required: ['name'], properties: { name: { type: 'string' }, role: { type: 'string', enum: ['organizer', 'attendee'], default: 'attendee' } } }] } } } },
        responses: { 201: { description: 'Account created' }, 400: { description: 'Invalid input' }, 409: { description: 'Email already registered' } }
      }
    },
    '/login': {
      post: { summary: 'Log in and obtain a JWT', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Credentials' } } } }, responses: { 200: { description: 'Authenticated' }, 401: { description: 'Invalid credentials' } } }
    },
    '/me': { get: { summary: 'Get the current user profile', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Current user' }, 401: { description: 'Unauthorized' } } } },
    '/me/registrations': { get: { summary: 'List current attendee registrations', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Registered events' }, 403: { description: 'Attendee role required' } } } },
    '/events': {
      get: { summary: 'List events', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Events' } } },
      post: { summary: 'Create an event (organizer)', security: [{ bearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/EventInput' } } } }, responses: { 201: { description: 'Event created' }, 403: { description: 'Organizer role required' } } }
    },
    '/events/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      get: { summary: 'Get event details', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Event' }, 404: { description: 'Not found' } } },
      put: { summary: 'Replace editable event fields (owner)', security: [{ bearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/EventInput' } } } }, responses: { 200: { description: 'Event updated' }, 403: { description: 'Owner required' } } },
      delete: { summary: 'Delete event (owner)', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Event deleted' }, 403: { description: 'Owner required' } } }
    },
    '/events/{id}/register': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      post: { summary: 'Register current attendee', security: [{ bearerAuth: [] }], responses: { 201: { description: 'Registered' }, 409: { description: 'Already registered' } } },
      delete: { summary: 'Cancel current attendee registration', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Cancelled' }, 404: { description: 'Registration not found' } } }
    },
    '/events/{id}/participants': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: { summary: 'List participants (owner)', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Safe participant profiles' }, 403: { description: 'Owner required' } } }
    },
    '/events/{id}/participants/{userId}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'userId', in: 'path', required: true, schema: { type: 'string' } }],
      delete: { summary: 'Remove a participant (owner)', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Removed' }, 404: { description: 'Registration not found' } } }
    }
  }
};
