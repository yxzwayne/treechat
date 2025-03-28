const { ConversationModel, MessageModel } = require('../models');

class ConversationService {
  async getConversation(uuid) {
    const conversations = await ConversationModel.findByUuid(uuid);

    if (conversations.length === 0) {
      const error = new Error('Conversation not found');
      error.status = 404;
      throw error;
    }

    return conversations[0];
  }

  async getConversationWithMessages(uuid) {
    const conversation = await this.getConversation(uuid);
    const messages = await MessageModel.findByConversationId(uuid);

    return {
      ...conversation,
      messages
    };
  }

  async createConversation(summary) {
    const result = await ConversationModel.create(summary);
    return result[0];
  }

  async updateConversation(uuid, data) {
    const result = await ConversationModel.update(uuid, data);

    if (result.length === 0) {
      const error = new Error('Conversation not found');
      error.status = 404;
      throw error;
    }

    return result[0];
  }

  async getAllConversations(limit, offset) {
    return await ConversationModel.getAll(limit, offset);
  }
}

module.exports = new ConversationService();