const users = new Map();
const events = new Map();

function resetStore() {
  users.clear();
  events.clear();
}

module.exports = { users, events, resetStore };
