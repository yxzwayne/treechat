import Router from '@koa/router';
import conversationController from '../controllers/conversationController.js';
import { validator } from '../middlewares/index.js';

const router = new Router({ prefix: '/api/conversations' });

router.get('/', conversationController.getAllConversations.bind(conversationController));
router.post('/', conversationController.createConversation.bind(conversationController));
router.get('/:uuid', validator.validateUuid, conversationController.getConversation.bind(conversationController));
router.get('/:uuid/messages', validator.validateUuid, conversationController.getConversationWithMessages.bind(conversationController));
router.put('/:uuid', validator.validateUuid, conversationController.updateConversation.bind(conversationController));

export default router;