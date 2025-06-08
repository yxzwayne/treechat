// We'll use the sql connection passed to the model at runtime
// This will be dynamically set based on the app context
import defaultSql from '../config/database.js';

// We will override this with the context SQL in the model methods
// For backward compatibility
let sql = defaultSql;

class AttachmentModel {
  // Accept a custom SQL connection (from app.context.sql)
  async findByUuid(uuid, customSql) {
    const db = customSql || sql;
    return await db`
      SELECT * FROM attachments WHERE uuid = ${uuid}
    `;
  }

  async findByMessageId(messageId, customSql) {
    const db = customSql || sql;
    return await db`
      SELECT * FROM attachments
      WHERE message_id = ${messageId}
      ORDER BY created_at ASC
    `;
  }

  async create(data, customSql) {
    const db = customSql || sql;
    const { message_id, mime_type, storage, path } = data;
    
    console.log(`Creating attachment for message: ${message_id} using database: ${db.options.database}`);
    
    return await db`
      INSERT INTO attachments (
        message_id, mime_type, storage, path
      )
      VALUES (
        ${message_id}, ${mime_type}, ${storage}, ${path}
      )
      RETURNING *
    `;
  }

  async delete(uuid, customSql) {
    const db = customSql || sql;
    return await db`
      DELETE FROM attachments
      WHERE uuid = ${uuid}
      RETURNING *
    `;
  }
}

export default new AttachmentModel();