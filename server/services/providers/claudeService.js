import Anthropic from '@anthropic-ai/sdk';
import PQueue from 'p-queue';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Claude client
const apiKey = process.env.ANTHROPIC_API_KEY || '';
const defaultModel = process.env.DEFAULT_MODEL || 'claude-3-7-sonnet-20250219';
const maxConcurrentRequests = parseInt(process.env.MAX_CONCURRENT_REQUESTS || '10', 10);

const anthropic = new Anthropic({
  apiKey
});

// Create a request queue with concurrency limit and rate limiting
const requestQueue = new PQueue({
  concurrency: maxConcurrentRequests, // Maximum number of concurrent requests
  intervalCap: 20, // Maximum number of requests per interval
  interval: 60 * 1000, // Interval in milliseconds (1 minute)
  autoStart: true, // Start processing as soon as tasks are added
  carryoverConcurrencyCount: true // Tasks in progress continue to count toward the concurrency limit
});

// Track how many requests we've made for metrics
let requestsMade = 0;
let requestsSucceeded = 0;
let requestsFailed = 0;

class ClaudeService {
  constructor() {
    if (!apiKey) {
      console.warn('ANTHROPIC_API_KEY is not set. Claude service will not be available.');
    } else {
      console.log(`Claude service initialized with model: ${defaultModel}`);
      console.log(`Max concurrent requests: ${maxConcurrentRequests}`);
    }
  }

  // Get metrics
  getMetrics() {
    return {
      provider: 'claude',
      model: defaultModel,
      requestsMade,
      requestsSucceeded,
      requestsFailed,
      queueSize: requestQueue.size,
      queuePending: requestQueue.pending
    };
  }

  // Send a message to Claude with automatic retries
  async sendMessage(messages, options = {}) {
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }

    const model = options.model || defaultModel;
    const maxRetries = options.maxRetries || 3;
    const maxTokens = options.maxTokens || 4096;
    const temperature = options.temperature || 0.7;

    // Add request to queue
    return requestQueue.add(async () => {
      let retries = 0;
      let lastError = null;
      requestsMade++;

      while (retries <= maxRetries) {
        try {
          console.log(`Sending request to Claude (model: ${model}, attempt: ${retries + 1})`);
          
          const response = await anthropic.messages.create({
            model,
            max_tokens: maxTokens,
            temperature,
            messages,
            system: options.systemPrompt || ''
          });

          requestsSucceeded++;
          return response;
        } catch (error) {
          retries++;
          lastError = error;
          
          console.error(`Claude API error (attempt ${retries}/${maxRetries + 1}):`, error.message);
          
          // Check if it's a rate limit error and we should retry
          if (error.status === 429 || (error.status >= 500 && error.status < 600)) {
            // Exponential backoff with jitter
            const delay = Math.min(1000 * Math.pow(2, retries) + Math.random() * 1000, 10000);
            console.log(`Retrying in ${Math.round(delay / 1000)} seconds...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            // For other errors, don't retry
            requestsFailed++;
            throw error;
          }
        }
      }

      // If we've exhausted all retries
      requestsFailed++;
      throw lastError;
    });
  }

  // Format messages for Claude API
  formatMessages(conversation) {
    return conversation.map(message => {
      return {
        role: message.sender === 'human' ? 'user' : 'assistant',
        content: message.text
      };
    });
  }
}

export default new ClaudeService();