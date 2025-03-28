const Router = require('@koa/router');
const messageController = require('../controllers/messageController.js');
const { validator } = require('../middlewares');

const router = new Router({ prefix: '/api/messages' });

router.get('/:uuid', validator.validateUuid, messageController.getMessage.bind(messageController));
router.get('/conversation/:conversationId', validator.validateUuid, messageController.getMessagesByConversation.bind(messageController));
router.post('/', messageController.createMessage.bind(messageController));

module.exports = router;