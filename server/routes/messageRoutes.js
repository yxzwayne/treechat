import Router from '@koa/router';
import messageController from '../controllers/messageController.js';
import { validator } from '../middlewares/index.js';

const router = new Router({ prefix: '/api/messages' });

router.get('/:uuid', validator.validateUuid, messageController.getMessage.bind(messageController));
router.get('/conversation/:conversationId', validator.validateUuid, messageController.getMessagesByConversation.bind(messageController));
router.post('/', messageController.createMessage.bind(messageController));

export default router;