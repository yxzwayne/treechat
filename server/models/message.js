const sql = require('../config/database');

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
    const { conversation_id, parent_id, sender, model_provider, content, text } = data;
    
    // Ensure content is JSON
    const contentJson = typeof content === 'string' ? JSON.parse(content) : content;

    return await sql`
      INSERT INTO messages (
        conversation_id, parent_id, sender, model_provider, content, text
      )
      VALUES (
        ${conversation_id}, ${parent_id}, ${sender}, ${model_provider}, ${contentJson}, ${text}
      )
      RETURNING *
    `;
  }
}

module.exports = new MessageModel();