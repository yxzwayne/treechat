const { MessageModel } = require('../models');
const conversationService = require('./conversationService');

class MessageService {
  async getMessage(uuid) {
    const messages = await MessageModel.findByUuid(uuid);

    if (messages.length === 0) {
      const error = new Error('Message not found');
      error.status = 404;
      throw error;
    }

    return messages[0];
  }

  async getMessagesByConversation(conversationId) {
    // First verify conversation exists
    await conversationService.getConversation(conversationId);

    return await MessageModel.findByConversationId(conversationId);
  }

  async createMessage(messageData) {
    // Verify conversation exists
    await conversationService.getConversation(messageData.conversation_id);

    // If parent_id exists, verify parent message exists
    if (messageData.parent_id) {
      const parentMessages = await MessageModel.findByUuid(messageData.parent_id);
      if (parentMessages.length === 0) {
        const error = new Error('Parent message not found');
        error.status = 404;
        throw error;
      }
    }

    const result = await MessageModel.create(messageData);
    return result[0];
  }
}

module.exports = new MessageService();