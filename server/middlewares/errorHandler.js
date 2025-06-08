async function errorHandler(ctx, next) {
  try {
    await next();
  } catch (err) {
    console.error('Error:', err);

    ctx.status = err.status || 500;
    ctx.body = {
      error: err.message || 'Internal Server Error'
    };

    ctx.app.emit('error', err, ctx);
  }
}

export default errorHandler;