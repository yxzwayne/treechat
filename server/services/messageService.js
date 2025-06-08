import { MessageModel } from '../models/index.js';
import conversationService from './conversationService.js';

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
    // if conversation_id is not null, verify conversation exists
    if (messageData.conversation_id) {
      await conversationService.getConversation(messageData.conversation_id);
    } else {
      // otherwise, it's a new conversation, so we create one first
      await conversationService.createConversation();
    }

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

export default new MessageService();