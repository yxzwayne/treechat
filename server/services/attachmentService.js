import { AttachmentModel, MessageModel } from '../models/index.js';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

// Configure uploads directory
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

class AttachmentService {
  constructor() {
    // Ensure upload directory exists
    this.ensureUploadDir();
  }

  async ensureUploadDir() {
    try {
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
    } catch (error) {
      console.error('Error creating upload directory:', error);
    }
  }

  async getAttachment(uuid) {
    const attachments = await AttachmentModel.findByUuid(uuid);

    if (attachments.length === 0) {
      const error = new Error('Attachment not found');
      error.status = 404;
      throw error;
    }

    return attachments[0];
  }

  async getAttachmentsByMessage(messageId) {
    // First verify message exists
    const messages = await MessageModel.findByUuid(messageId);
    if (messages.length === 0) {
      const error = new Error('Message not found');
      error.status = 404;
      throw error;
    }

    return await AttachmentModel.findByMessageId(messageId);
  }

  async createAttachment(file, messageId) {
    // First verify message exists
    const messages = await MessageModel.findByUuid(messageId);
    if (messages.length === 0) {
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

    const result = await AttachmentModel.create(attachmentData);
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