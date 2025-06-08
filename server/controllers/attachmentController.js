import { AttachmentService } from '../services/index.js';
import fs from 'fs';
import path from 'path';

class AttachmentController {
  async getAttachment(ctx) {
    const { uuid } = ctx.params;
    // Pass context SQL to ensure we use the right database connection
    const attachment = await AttachmentService.getAttachment(uuid, ctx.sql);
    ctx.body = attachment;
  }

  async getAttachmentFile(ctx) {
    const { uuid } = ctx.params;
    // Pass context SQL to ensure we use the right database connection
    const attachment = await AttachmentService.getAttachment(uuid, ctx.sql);
    const filePath = AttachmentService.getFilePath(attachment);

    try {
      // Check if file exists
      await fs.promises.access(filePath);
      
      // Set content type if available
      if (attachment.mime_type) {
        ctx.type = attachment.mime_type;
      }
      
      // Stream the file
      ctx.body = fs.createReadStream(filePath);
    } catch (error) {
      ctx.status = 404;
      ctx.body = { error: 'File not found' };
    }
  }

  async getAttachmentsByMessage(ctx) {
    const { messageId } = ctx.params;
    // Pass context SQL to ensure we use the right database connection
    const attachments = await AttachmentService.getAttachmentsByMessage(messageId, ctx.sql);
    ctx.body = attachments;
  }

  async createAttachment(ctx) {
    const { messageId } = ctx.params;
    const file = ctx.request.files?.file;

    if (!file) {
      ctx.status = 400;
      ctx.body = { error: 'No file uploaded' };
      return;
    }

    console.log(`AttachmentController: Creating attachment for message ID: ${messageId} using DB: ${ctx.sql.options.database}`);
    
    // Pass context SQL to ensure we use the right database connection
    const attachment = await AttachmentService.createAttachment(file, messageId, ctx.sql);
    ctx.status = 201;
    ctx.body = attachment;
  }

  async deleteAttachment(ctx) {
    const { uuid } = ctx.params;
    const attachment = await AttachmentService.deleteAttachment(uuid);
    ctx.body = attachment;
  }
}

export default new AttachmentController();