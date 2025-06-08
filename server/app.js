import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import { errorHandler } from './middlewares/index.js';
import { conversationRoutes, messageRoutes } from './routes/index.js';
import sql from './config/database.js';

const app = new Koa();

app.on('error', (err, ctx) => {
  console.error('Server error:', err);
});

app.use(async (ctx, next) => {
  if (ctx.path === '/health') {
    ctx.body = { status: 'ok', time: new Date().toISOString() };
    return;
  } else if (ctx.path === '/') {
    ctx.body = 'Hello Treechat';
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

export { app, sql };