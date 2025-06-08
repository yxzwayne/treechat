import sql from '../config/database.js';

class AttachmentModel {
  async findByUuid(uuid) {
    return await sql`
      SELECT * FROM attachments WHERE uuid = ${uuid}
    `;
  }

  async findByMessageId(messageId) {
    return await sql`
      SELECT * FROM attachments
      WHERE message_id = ${messageId}
      ORDER BY created_at ASC
    `;
  }

  async create(data) {
    const { message_id, mime_type, storage, path } = data;
    
    return await sql`
      INSERT INTO attachments (
        message_id, mime_type, storage, path
      )
      VALUES (
        ${message_id}, ${mime_type}, ${storage}, ${path}
      )
      RETURNING *
    `;
  }

  async delete(uuid) {
    return await sql`
      DELETE FROM attachments
      WHERE uuid = ${uuid}
      RETURNING *
    `;
  }
}

export default new AttachmentModel();