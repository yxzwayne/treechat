import Router from '@koa/router';
import MetricsController from '../controllers/metricsController.js';

const router = new Router({ prefix: '/api/metrics' });

router.get('/', MetricsController.getMetrics.bind(MetricsController));

export default router;