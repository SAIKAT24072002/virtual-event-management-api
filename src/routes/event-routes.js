const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { requireRole } = require('../middleware/auth');

function createEventRoutes(controller, authenticate) {
  const router = express.Router();
  router.use(authenticate);
  router.get('/', controller.list);
  router.post('/', requireRole('organizer'), controller.create);
  router.get('/:id', controller.detail);
  router.put('/:id', controller.update);
  router.delete('/:id', controller.remove);
  router.post('/:id/register', requireRole('attendee'), asyncHandler(controller.register));
  router.delete('/:id/register', requireRole('attendee'), controller.cancel);
  router.get('/:id/participants', controller.participants);
  router.delete('/:id/participants/:userId', controller.removeParticipant);
  return router;
}

module.exports = { createEventRoutes };
