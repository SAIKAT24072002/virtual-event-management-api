require('dotenv').config();
const { createApp } = require('./app');

if (!process.env.JWT_SECRET) {
  console.error('Startup failed: JWT_SECRET environment variable is required');
  process.exit(1);
}

try {
  const app = createApp();
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Virtual Event Management API listening on 0.0.0.0:${port}`);
  });
} catch (error) {
  console.error(`Startup failed: ${error.message}`);
  process.exit(1);
}
