const { ConversationService } = require('../services');

class ConversationController {
  async getConversation(ctx) {
    const { uuid } = ctx.params;
    const conversation = await ConversationService.getConversation(uuid);
    ctx.body = conversation;
  }

  async getConversationWithMessages(ctx) {
    const { uuid } = ctx.params;
    const data = await ConversationService.getConversationWithMessages(uuid);
    ctx.body = data;
  }

  async createConversation(ctx) {
    const { summary } = ctx.request.body;
    const conversation = await ConversationService.createConversation(summary);
    ctx.status = 201;
    ctx.body = conversation;
  }

  async updateConversation(ctx) {
    const { uuid } = ctx.params;
    const data = ctx.request.body;
    const conversation = await ConversationService.updateConversation(uuid, data);
    ctx.body = conversation;
  }

  async getAllConversations(ctx) {
    const limit = parseInt(ctx.query.limit) || 20;
    const offset = parseInt(ctx.query.offset) || 0;
    const conversations = await ConversationService.getAllConversations(limit, offset);
    ctx.body = conversations;
  }
}

module.exports = new ConversationController();