const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const { errorHandler } = require('./middlewares');
const { conversationRoutes, messageRoutes } = require('./routes');
const sql = require('./config/database');

const app = new Koa();

// Add error event listener
app.on('error', (err, ctx) => {
  console.error('Server error:', err);
});

// Add basic health check endpoint
app.use(async (ctx, next) => {
  if (ctx.path === '/health') {
    ctx.body = { status: 'ok', time: new Date().toISOString() };
    return;
  }
  await next();
});

app.use(errorHandler);
app.use(bodyParser());

app.use(conversationRoutes.routes());
app.use(conversationRoutes.allowedMethods());
app.use(messageRoutes.routes());
app.use(messageRoutes.allowedMethods());

const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
  console.log(`Chat server running on http://localhost:${port}`);
});

process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  await sql.end();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = { app, sql };