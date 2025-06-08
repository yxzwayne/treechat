import Router from '@koa/router';
import { AttachmentController } from '../controllers/index.js';
import { validator } from '../middlewares/index.js';

const router = new Router({ prefix: '/api/attachments' });

router.get('/:uuid', validator.validateUuid, AttachmentController.getAttachment.bind(AttachmentController));
router.get('/:uuid/file', validator.validateUuid, AttachmentController.getAttachmentFile.bind(AttachmentController));
router.get('/message/:messageId', validator.validateUuid, AttachmentController.getAttachmentsByMessage.bind(AttachmentController));
router.post('/message/:messageId', validator.validateUuid, AttachmentController.createAttachment.bind(AttachmentController));
router.delete('/:uuid', validator.validateUuid, AttachmentController.deleteAttachment.bind(AttachmentController));

export default router;