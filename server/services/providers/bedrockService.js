import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import PQueue from 'p-queue';

// AWS credentials will be taken from env vars: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
const region = process.env.AWS_REGION || 'us-west-2';
const client = new BedrockRuntimeClient({ region });

// Create a request queue with concurrency limit and rate limiting
const requestQueue = new PQueue({
  concurrency: 5, // Maximum number of concurrent requests
  intervalCap: 20, // Maximum number of requests per interval
  interval: 60 * 1000, // Interval in milliseconds (1 minute)
  autoStart: true, // Start processing as soon as tasks are added
  carryoverConcurrencyCount: true // Tasks in progress continue to count toward the concurrency limit
});

// Track how many requests we've made for metrics
let requestsMade = 0;
let requestsSucceeded = 0;
let requestsFailed = 0;

class BedrockService {
  constructor() {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      console.warn('AWS credentials not set. Bedrock service will not be available.');
    }
  }

  // Get metrics
  getMetrics() {
    return {
      provider: 'bedrock',
      requestsMade,
      requestsSucceeded,
      requestsFailed,
      queueSize: requestQueue.size,
      queuePending: requestQueue.pending
    };
  }

  // Send a message to Bedrock with automatic retries
  async sendMessage(messages, options = {}) {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials not set');
    }

    // Default to Anthropic's Claude model on Bedrock
    const model = options.model || 'anthropic.claude-3-haiku-20240307-v1:0';
    const maxRetries = options.maxRetries || 3;
    const maxTokens = options.maxTokens || 4096;
    const temperature = options.temperature || 0.7;

    // Format the body based on the model provider
    let body;
    if (model.startsWith('anthropic.')) {
      // Anthropic format
      body = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: maxTokens,
        temperature,
        messages: this.formatClaudeMessages(messages),
        system: options.systemPrompt || ''
      };
    } else {
      throw new Error(`Unsupported model: ${model}`);
    }

    // Add request to queue
    return requestQueue.add(async () => {
      let retries = 0;
      let lastError = null;
      requestsMade++;

      while (retries <= maxRetries) {
        try {
          console.log(`Sending request to Bedrock (model: ${model}, attempt: ${retries + 1})`);
          
          const command = new InvokeModelCommand({
            modelId: model,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify(body)
          });

          const response = await client.send(command);
          const responseBody = JSON.parse(Buffer.from(response.body).toString('utf8'));
          
          requestsSucceeded++;
          return responseBody;
        } catch (error) {
          retries++;
          lastError = error;
          
          console.error(`Bedrock API error (attempt ${retries}/${maxRetries + 1}):`, error.message);
          
          // ThrottlingException or ServiceUnavailable errors should be retried
          if (error.name === 'ThrottlingException' || error.name === 'ServiceUnavailableException' || error.name === 'InternalServerException') {
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

  // Format messages for Claude on Bedrock
  formatClaudeMessages(conversation) {
    return conversation.map(message => {
      return {
        role: message.sender === 'human' ? 'user' : 'assistant',
        content: message.text
      };
    });
  }
}

export default new BedrockService();