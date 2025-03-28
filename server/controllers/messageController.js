const { MessageService } = require('../services');

class MessageController {
  async getMessage(ctx) {
    const { uuid } = ctx.params;
    const message = await MessageService.getMessage(uuid);
    ctx.body = message;
  }

  async getMessagesByConversation(ctx) {
    const { conversationId } = ctx.params;
    const messages = await MessageService.getMessagesByConversation(conversationId);
    ctx.body = messages;
  }

  async createMessage(ctx) {
    const messageData = ctx.request.body;
    const message = await MessageService.createMessage(messageData);
    ctx.status = 201;
    ctx.body = message;
  }
}

module.exports = new MessageController();
