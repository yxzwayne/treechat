import { AttachmentModel, MessageModel } from '../models/index.js';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

// Get the correct database connection
let sql;
if (process.env.NODE_ENV === 'test') {
  const testSql = await import('../config/database.test.js');
  sql = testSql.default;
} else {
  const prodSql = await import('../config/database.js');
  sql = prodSql.default;
}

// Configure uploads directory
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

class AttachmentService {
  constructor() {
    // Ensure upload directory exists
    this.ensureUploadDir();
    
    // Ensure attachments table exists
    this.ensureAttachmentsTable();
  }
  
  async ensureAttachmentsTable() {
    try {
      console.log('Checking if attachments table exists...');
      
      // Check if the table exists
      const tableExists = await sql`
        SELECT EXISTS (
          SELECT FROM pg_tables 
          WHERE schemaname = 'public' 
          AND tablename = 'attachments'
        ) as exists
      `;
      
      if (!tableExists[0]?.exists) {
        console.log('Creating attachments table...');
        
        // Create the attachments table - split into separate commands
        await sql`
          CREATE TABLE IF NOT EXISTS attachments (
            uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            message_id UUID NOT NULL REFERENCES messages(uuid),
            mime_type TEXT,
            storage TEXT DEFAULT 'local',
            path TEXT,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `;
        
        // Create indexes separately
        await sql`CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON attachments(message_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_attachments_storage ON attachments(storage)`;
        
        console.log('Attachments table created successfully');
      } else {
        console.log('Attachments table already exists');
      }
    } catch (error) {
      console.error('Error ensuring attachments table exists:', error);
    }
  }

  async ensureUploadDir() {
    try {
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
    } catch (error) {
      console.error('Error creating upload directory:', error);
    }
  }

  async getAttachment(uuid, contextSql) {
    const attachments = await AttachmentModel.findByUuid(uuid, contextSql);

    if (attachments.length === 0) {
      const error = new Error('Attachment not found');
      error.status = 404;
      throw error;
    }

    return attachments[0];
  }

  async getAttachmentsByMessage(messageId, contextSql) {
    // First verify message exists
    console.log(`Verifying message exists with ID: ${messageId} for getAttachmentsByMessage`);
    const messages = await MessageModel.findByUuid(messageId, contextSql);
    console.log(`Message search result length: ${messages.length}`);
    
    if (messages.length === 0) {
      const error = new Error('Message not found');
      error.status = 404;
      throw error;
    }

    return await AttachmentModel.findByMessageId(messageId, contextSql);
  }

  async createAttachment(file, messageId, contextSql) {
    console.log(`Creating attachment for message ID: ${messageId} with context SQL`);
    
    // First verify message exists
    console.log(`Verifying message exists with ID: ${messageId} for createAttachment`);
    const messages = await MessageModel.findByUuid(messageId, contextSql);
    console.log(`Message search result length: ${messages.length}`);
    
    if (messages.length === 0) {
      // Directly query for debug
      console.log('Message not found in model, checking with direct SQL query');
      if (contextSql) {
        const directCheck = await contextSql`SELECT * FROM messages WHERE uuid = ${messageId}`;
        console.log(`Direct SQL query returned ${directCheck.length} messages`);
        
        // List all messages for debug
        const allMessages = await contextSql`SELECT uuid FROM messages LIMIT 10`;
        console.log('Available message IDs:', allMessages.map(m => m.uuid));
      }
      
      const error = new Error('Message not found');
      error.status = 404;
      throw error;
    }

    // Generate a unique filename to prevent collisions
    const timestamp = Date.now();
    const uniqueId = randomUUID().replace(/-/g, '');
    const originalName = file.originalname || file.name || 'unknown-file';
    const filename = `${timestamp}-${uniqueId}-${originalName}`;
    const filePath = path.join(UPLOAD_DIR, filename);

    // Create file on disk
    try {
      // Handle different file formats (Buffer, File object, FormData file)
      if (file.buffer) {
        // If it's a multer file (buffer property)
        await fs.writeFile(filePath, file.buffer);
      } else if (file.stream) {
        // If it's a stream (formidable)
        const fileStream = fs.createWriteStream(filePath);
        file.stream.pipe(fileStream);
        await new Promise((resolve, reject) => {
          fileStream.on('finish', resolve);
          fileStream.on('error', reject);
        });
      } else if (file.path) {
        // If it's already saved by formidable
        const tempPath = file.path;
        await fs.copyFile(tempPath, filePath);
      } else if (file instanceof Blob || file instanceof File) {
        // If it's a File or Blob object from test
        const buffer = Buffer.from(await file.arrayBuffer());
        await fs.writeFile(filePath, buffer);
      } else {
        // Fallback for string content (for tests)
        const content = typeof file === 'string' ? file : JSON.stringify(file);
        await fs.writeFile(filePath, content);
      }
    } catch (error) {
      console.error('Error saving file:', error);
      const err = new Error('Failed to save file');
      err.status = 500;
      throw err;
    }

    // Create attachment record in database
    const attachmentData = {
      message_id: messageId,
      mime_type: file.mimetype || file.type || 'application/octet-stream',
      storage: 'local',
      path: filename
    };

    console.log(`Saving attachment to database with message ID: ${messageId}`);
    const result = await AttachmentModel.create(attachmentData, contextSql);
    return result[0];
  }

  async deleteAttachment(uuid) {
    // Find attachment to get file path
    const attachments = await AttachmentModel.findByUuid(uuid);
    if (attachments.length === 0) {
      const error = new Error('Attachment not found');
      error.status = 404;
      throw error;
    }

    const attachment = attachments[0];

    // Delete file from disk if it's a local file
    if (attachment.storage === 'local' && attachment.path) {
      try {
        await fs.unlink(path.join(UPLOAD_DIR, attachment.path));
      } catch (error) {
        console.error('Error deleting file:', error);
        // Continue even if file deletion fails
      }
    }

    // Delete record from database
    const result = await AttachmentModel.delete(uuid);
    return result[0];
  }

  // Get the file path for an attachment
  getFilePath(attachment) {
    if (attachment.storage !== 'local') {
      const error = new Error('Only local storage is supported');
      error.status = 400;
      throw error;
    }

    return path.join(UPLOAD_DIR, attachment.path);
  }
}

export default new AttachmentService();