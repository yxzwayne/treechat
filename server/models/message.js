import sql from '../config/database.js';

class MessageModel {
  async findByUuid(uuid) {
    return await sql`
      SELECT * FROM messages WHERE uuid = ${uuid}
    `;
  }

  async findByConversationId(conversationId) {
    return await sql`
      SELECT * FROM messages
      WHERE conversation_id = ${conversationId}
      ORDER BY created_at ASC
    `;
  }

  async create(data) {
    const { 
      conversation_id, 
      parent_id = null, 
      sender, 
      model_provider = null, 
      content, 
      text 
    } = data;
    
    // Ensure content is JSON and handle empty/undefined content
    const contentJson = content 
      ? (typeof content === 'string' ? JSON.parse(content) : content) 
      : { text };

    // Make sure we have at least the required fields
    if (!conversation_id || !sender || !contentJson) {
      throw new Error('Missing required fields: conversation_id, sender, content');
    }

    return await sql`
      INSERT INTO messages (
        conversation_id, parent_id, sender, model_provider, content, text
      )
      VALUES (
        ${conversation_id}, ${parent_id}, ${sender}, ${model_provider}, ${contentJson}, ${text || ''}
      )
      RETURNING *
    `;
  }
}

export default new MessageModel();