import ClaudeService from './claudeService.js';
import BedrockService from './bedrockService.js';

// Provider factory
class ProviderFactory {
  getProvider(name) {
    switch (name?.toLowerCase()) {
      case 'claude':
        return ClaudeService;
      case 'bedrock':
        return BedrockService;
      default:
        // Default to Claude
        return ClaudeService;
    }
  }

  getMetrics() {
    return {
      claude: ClaudeService.getMetrics(),
      bedrock: BedrockService.getMetrics()
    };
  }
}

export default new ProviderFactory();