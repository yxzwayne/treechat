const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates a UUID parameter from request params or query
 */
function validateUuid(ctx, next) {
  // First check for uuid param (direct endpoints like /uuid)
  let uuid = ctx.params.uuid;
  
  // If not found, check other common param names
  if (!uuid) {
    // Check for other common param names
    uuid = ctx.params.messageId || ctx.params.conversationId || ctx.params.attachmentId;
  }
  
  // If still not found, check query params
  if (!uuid) {
    uuid = ctx.query.uuid || ctx.query.messageId || ctx.query.conversationId || ctx.query.attachmentId;
  }

  // Validation
  if (!uuid) {
    ctx.status = 400;
    ctx.body = { error: 'UUID parameter is required' };
    return;
  }

  if (!uuidRegex.test(uuid)) {
    ctx.status = 400;
    ctx.body = { error: 'Invalid UUID format' };
    return;
  }

  return next();
}

/**
 * Validates a request body
 */
function validateBody(schema) {
  return async (ctx, next) => {
    const body = ctx.request.body;
    
    if (!body) {
      ctx.status = 400;
      ctx.body = { error: 'Request body is required' };
      return;
    }

    try {
      // Simple validation
      for (const [field, rules] of Object.entries(schema)) {
        if (rules.required && (body[field] === undefined || body[field] === null)) {
          ctx.status = 400;
          ctx.body = { error: `Field '${field}' is required` };
          return;
        }
      }
      
      return next();
    } catch (error) {
      ctx.status = 400;
      ctx.body = { error: `Validation error: ${error.message}` };
    }
  };
}

export {
  validateUuid,
  validateBody
};