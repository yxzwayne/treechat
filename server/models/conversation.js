const sql = require('../config/database');

class ConversationModel {
  async findByUuid(uuid) {
    return await sql`
      SELECT * FROM conversations WHERE uuid = ${uuid}
    `;
  }

  async create(summary = null) {
    return await sql`
      INSERT INTO conversations (summary)
      VALUES (${summary})
      RETURNING *
    `;
  }

  async update(uuid, data) {
    const { summary, status } = data;
    return await sql`
      UPDATE conversations
      SET summary = ${summary}, status = ${status}
      WHERE uuid = ${uuid}
      RETURNING *
    `;
  }

  async getAll(limit = 20, offset = 0) {
    return await sql`
      SELECT * FROM conversations
      ORDER BY updated_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }
}

module.exports = new ConversationModel();
