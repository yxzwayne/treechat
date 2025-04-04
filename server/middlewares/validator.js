function validateUuid(ctx, next) {
  const uuid = ctx.params.uuid || ctx.query.uuid;

  if (!uuid) {
    ctx.status = 400;
    ctx.body = { error: 'UUID parameter is required' };
    return;
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(uuid)) {
    ctx.status = 400;
    ctx.body = { error: 'Invalid UUID format' };
    return;
  }

  return next();
}

module.exports = {
  validateUuid
};