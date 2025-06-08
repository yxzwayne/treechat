import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import koaBody from 'koa-body';
import fs from 'fs';
import path from 'path';
import { errorHandler } from './middlewares/index.js';
import { conversationRoutes, messageRoutes, attachmentRoutes, metricsRoutes } from './routes/index.js';
import sql from './config/database.js';

const app = new Koa();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log(`Created uploads directory: ${uploadsDir}`);
}

// Add sql to the app context for easier access in controllers
app.context.sql = sql;

// Error handling
app.on('error', (err, ctx) => {
  console.error('Server error:', err);
});

// Health check and home routes
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

// Error handling middleware
app.use(errorHandler);

// File upload handling
const fileMiddleware = koaBody({
  multipart: true,
  formidable: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    keepExtensions: true,
    uploadDir: uploadsDir,
    multiples: false
  }
});

// Apply file middleware only to attachment routes that need it
app.use(async (ctx, next) => {
  if (ctx.path.startsWith('/api/attachments') && ctx.method === 'POST') {
    await fileMiddleware(ctx, next);
  } else {
    await bodyParser()(ctx, next);
  }
});

// Enable CORS for development
app.use(async (ctx, next) => {
  ctx.set('Access-Control-Allow-Origin', '*');
  ctx.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  ctx.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  
  if (ctx.method === 'OPTIONS') {
    ctx.status = 204;
    return;
  }
  
  await next();
});

// Register routes
app.use(conversationRoutes.routes());
app.use(conversationRoutes.allowedMethods());
app.use(messageRoutes.routes());
app.use(messageRoutes.allowedMethods());
app.use(attachmentRoutes.routes());
app.use(attachmentRoutes.allowedMethods());
app.use(metricsRoutes.routes());
app.use(metricsRoutes.allowedMethods());

// Start server
const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
  console.log(`Chat server running on http://localhost:${port}`);
});

// Graceful shutdown
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