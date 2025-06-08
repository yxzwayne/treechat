import { MessageModel } from '../models/index.js';
import conversationService from './conversationService.js';
import providerFactory from './providers/index.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class MessageService {
  constructor() {
    // Metrics
    this.metrics = {
      totalMessages: 0,
      humanMessages: 0,
      aiMessages: 0,
      systemMessages: 0,
      aiResponses: 0
    };
  }

  // Get metrics
  getMetrics() {
    return {
      ...this.metrics,
      providers: providerFactory.getMetrics()
    };
  }

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
    // Update metrics
    this.metrics.totalMessages++;
    if (messageData.sender === 'human') {
      this.metrics.humanMessages++;
    } else if (messageData.sender === 'ai') {
      this.metrics.aiMessages++;
    } else if (messageData.sender === 'system') {
      this.metrics.systemMessages++;
    }

    // if conversation_id is not null, verify conversation exists
    if (messageData.conversation_id) {
      await conversationService.getConversation(messageData.conversation_id);
    } else {
      // otherwise, it's a new conversation, so we create one first
      const conversation = await conversationService.createConversation();
      messageData.conversation_id = conversation.uuid;
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
    const message = result[0];

    // If requested, generate an AI response
    if (messageData.generate_response === true && messageData.sender === 'human') {
      try {
        // Get conversation history to provide context
        const conversationHistory = await this.getMessageThread(message);
        
        // Get the provider based on model_provider or default to claude
        const provider = providerFactory.getProvider(messageData.model_provider || 'claude');
        
        // Format messages for the provider
        const formattedMessages = provider.formatMessages(conversationHistory);
        
        // Send request to AI provider
        console.log(`Generating AI response to message ${message.uuid}`);
        const response = await provider.sendMessage(formattedMessages, {
          model: process.env.DEFAULT_MODEL,
          maxTokens: 4096,
          temperature: 0.7
        });
        
        // Create AI response message
        const aiMessageData = {
          conversation_id: message.conversation_id,
          parent_id: message.uuid,
          sender: 'ai',
          model_provider: messageData.model_provider || 'claude',
          content: response,
          text: response.content?.[0]?.text || ''
        };
        
        await MessageModel.create(aiMessageData);
        this.metrics.aiResponses++;
        
        console.log(`AI response generated for message ${message.uuid}`);
      } catch (error) {
        console.error(`Error generating AI response: ${error.message}`);
        // We don't throw here to allow the original message to be returned
      }
    }

    return message;
  }

  // Helper to get conversation thread for a message
  async getMessageThread(message, maxDepth = 10) {
    const thread = [message];
    let currentMessage = message;
    let depth = 0;
    
    // Walk up the thread to build context
    while (currentMessage.parent_id && depth < maxDepth) {
      const parentMessages = await MessageModel.findByUuid(currentMessage.parent_id);
      if (parentMessages.length === 0) break;
      
      const parentMessage = parentMessages[0];
      thread.unshift(parentMessage);
      currentMessage = parentMessage;
      depth++;
    }
    
    return thread;
  }
}

export default new MessageService();