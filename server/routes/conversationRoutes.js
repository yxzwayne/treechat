const Router = require('@koa/router');
const conversationController = require('../controllers/conversationController.js');
const { validator } = require('../middlewares');

const router = new Router({ prefix: '/api/conversations' });

router.get('/', conversationController.getAllConversations.bind(conversationController));
router.post('/', conversationController.createConversation.bind(conversationController));
router.get('/:uuid', validator.validateUuid, conversationController.getConversation.bind(conversationController));
router.get('/:uuid/messages', validator.validateUuid, conversationController.getConversationWithMessages.bind(conversationController));
router.put('/:uuid', validator.validateUuid, conversationController.updateConversation.bind(conversationController));

module.exports = router;