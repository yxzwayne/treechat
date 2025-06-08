import { MessageService } from '../services/index.js';
import os from 'os';

class MetricsController {
  async getMetrics(ctx) {
    // Collect basic system metrics
    const systemMetrics = {
      uptime: process.uptime(),
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        usedPercent: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2)
      },
      cpu: {
        cores: os.cpus().length,
        loadAvg: os.loadavg()
      }
    };

    // Collect service metrics
    const serviceMetrics = {
      db: {
        status: 'connected'
      },
      message: {
        status: 'ok'
      }
    };

    ctx.body = {
      system: systemMetrics,
      services: serviceMetrics,
      timestamp: new Date().toISOString()
    };
  }
}

export default new MetricsController();