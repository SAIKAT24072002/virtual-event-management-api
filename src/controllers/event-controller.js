const crypto = require('crypto');
const { events, users } = require('../store');
const { validateEvent, validateSchedule } = require('../validation');
const { publicEvent, safeUser } = require('../utils/serializers');
const ApiError = require('../utils/api-error');

function getEvent(id) {
  const event = events.get(id);
  if (!event) throw new ApiError(404, 'Event not found');
  return event;
}

function requireOwner(event, user) {
  if (user.role !== 'organizer' || event.organizerId !== user.id) {
    throw new ApiError(403, 'Only the event owner can perform this action');
  }
}

function createEventController({ emailService }) {
  return {
    list(req, res) {
      res.json({ success: true, data: { events: [...events.values()].map(publicEvent) } });
    },
    detail(req, res) {
      res.json({ success: true, data: { event: publicEvent(getEvent(req.params.id)) } });
    },
    create(req, res) {
      const input = validateEvent(req.body);
      const now = new Date().toISOString();
      const event = {
        id: crypto.randomUUID(),
        ...input,
        organizerId: req.user.id,
        participants: [],
        createdAt: now,
        updatedAt: now
      };
      events.set(event.id, event);
      res.status(201).json({ success: true, data: { event: publicEvent(event) } });
    },
    update(req, res) {
      const event = getEvent(req.params.id);
      requireOwner(event, req.user);
      const input = validateEvent(req.body);
      Object.assign(event, input, { updatedAt: new Date().toISOString() });
      res.json({ success: true, data: { event: publicEvent(event) } });
    },
    remove(req, res) {
      const event = getEvent(req.params.id);
      requireOwner(event, req.user);
      events.delete(event.id);
      res.json({ success: true, data: { message: 'Event deleted' } });
    },
    async register(req, res) {
      const event = getEvent(req.params.id);
      validateSchedule(event.date, event.time);
      if (event.participants.includes(req.user.id)) throw new ApiError(409, 'Already registered for this event');
      event.participants.push(req.user.id);
      event.updatedAt = new Date().toISOString();
      let notification;
      try {
        const result = await emailService.sendEventConfirmation(req.user, event);
        notification = result.delivered
          ? { status: 'sent' }
          : { status: 'preview', message: 'Email was previewed locally and not delivered' };
      } catch (error) {
        console.error('Event confirmation email failed:', error.message);
        notification = { status: 'failed', message: 'Registration succeeded, but confirmation email could not be sent' };
      }
      res.status(201).json({ success: true, data: { event: publicEvent(event), notification } });
    },
    cancel(req, res) {
      const event = getEvent(req.params.id);
      const index = event.participants.indexOf(req.user.id);
      if (index === -1) throw new ApiError(404, 'Registration not found');
      event.participants.splice(index, 1);
      event.updatedAt = new Date().toISOString();
      res.json({ success: true, data: { message: 'Registration cancelled' } });
    },
    myRegistrations(req, res) {
      const registered = [...events.values()]
        .filter((event) => event.participants.includes(req.user.id))
        .map(publicEvent);
      res.json({ success: true, data: { events: registered } });
    },
    participants(req, res) {
      const event = getEvent(req.params.id);
      requireOwner(event, req.user);
      const participants = event.participants
        .map((id) => users.get(id))
        .filter(Boolean)
        .map((user) => safeUser(user));
      res.json({ success: true, data: { participants, participantCount: participants.length } });
    },
    removeParticipant(req, res) {
      const event = getEvent(req.params.id);
      requireOwner(event, req.user);
      const index = event.participants.indexOf(req.params.userId);
      if (index === -1) throw new ApiError(404, 'Participant registration not found');
      event.participants.splice(index, 1);
      event.updatedAt = new Date().toISOString();
      res.json({ success: true, data: { message: 'Participant removed' } });
    }
  };
}

module.exports = { createEventController };
