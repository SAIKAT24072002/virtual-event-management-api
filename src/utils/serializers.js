function safeUser(user, includeEmail = true) {
  const result = {
    id: user.id,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt
  };
  if (includeEmail) result.email = user.email;
  return result;
}

function publicEvent(event) {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    date: event.date,
    time: event.time,
    organizerId: event.organizerId,
    participantCount: event.participants.length,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt
  };
}

module.exports = { safeUser, publicEvent };
