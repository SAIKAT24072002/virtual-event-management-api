const jwt = require('jsonwebtoken');
const { users } = require('../store');
const ApiError = require('../utils/api-error');

function createAuth(jwtSecret) {
  return function authenticate(req, res, next) {
    const header = req.get('authorization');
    if (!header || !header.startsWith('Bearer ')) return next(new ApiError(401, 'Authentication token is required'));
    const token = header.slice(7).trim();
    if (!token) return next(new ApiError(401, 'Authentication token is required'));
    try {
      const payload = jwt.verify(token, jwtSecret);
      const user = users.get(payload.sub);
      if (!user) return next(new ApiError(401, 'Token user no longer exists'));
      req.user = user;
      return next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') return next(new ApiError(401, 'Authentication token has expired'));
      return next(new ApiError(401, 'Authentication token is invalid'));
    }
  };
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) return next(new ApiError(403, `${role} role required`));
    return next();
  };
}

module.exports = { createAuth, requireRole };
