const ApiError = require('../utils/api-error');

function notFound(req, res, next) {
  next(new ApiError(404, 'Route not found'));
}

function errorHandler(error, req, res, next) {
  let status = error.status || 500;
  let message = error.message || 'Internal server error';
  if (error.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON request body';
  } else if (error.type === 'entity.too.large') {
    status = 413;
    message = 'Request body is too large';
  }
  const body = { success: false, error: { message } };
  if (error.details) body.error.details = error.details;
  if (process.env.NODE_ENV !== 'production' && status === 500) body.error.stack = error.stack;
  if (status === 500) console.error('Unhandled request error:', error.message);
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
