# Treechat Project Documentation

## Project Overview

Treechat is an AI chat interface with tree-structured conversations, allowing users to fork their chats and explore multiple conversation branches. This project aims to provide a coherent, usable, and modern UI/UX for visualizing conversation trees.

## Motivation

> I should be able to fork my conversation with a chatbot.
> – Adam Rankin

Current AI chat interfaces for ANY AI products (Chatgpt, Claude, Deepsee) already have mature UX for creating new forks to conversations, but the branches are never fully visualized, simply hidden behind some toggling left and right arrows at best. Nobody has tried to tackle the challenge of providing a coherent, usable and modern UI+UX for viewing chats as trees, so this is what we want to do.

## Current Status - Stage 1 Complete

We have successfully completed Stage 1 of the project, implementing a functioning and stable backend with the following features:

- Full API implementation based on the OpenAPI specification
- Tree-structured conversation storage with parent-child relationships
- AI provider integration with Claude API
- File attachment support for messages
- Comprehensive test suite including API and AI integration tests
- Support for concurrent message processing

### Implemented Features

1. **Conversation Management**
   - Create, retrieve, update conversations
   - List all conversations with pagination

2. **Message Handling**
   - Create human messages with optional AI response generation
   - Tree structure with parent-child relationships
   - Retrieve messages by conversation or ID

3. **AI Integration**
   - Claude API integration with automatic response generation
   - Queue system for handling concurrent requests
   - Configurable model parameters
   - Error handling with retries for API failures

4. **File Attachments**
   - Upload and attach files to messages
   - Retrieve file metadata and content
   - Support for multiple attachment formats

5. **System Metrics**
   - Performance monitoring endpoints
   - Usage statistics for API calls

### Technical Implementation

The backend is built with:
- **Bun**: JavaScript runtime and package manager
- **Koa.js**: Web framework for the API
- **PostgreSQL**: Database for storing conversations, messages, and attachments
- **Claude API**: AI provider for generating responses

## Database Schema

We've implemented the database schema as planned, with the following tables:

```sql
-- Enum for message roles
CREATE TYPE message_role AS ENUM ('human', 'ai', 'system');

-- Conversations table
CREATE TABLE conversations (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    summary TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    status TEXT DEFAULT 'active'
);

-- Messages table
CREATE TABLE messages (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL,
    parent_id UUID,
    sender message_role NOT NULL,
    model_provider TEXT DEFAULT NULL,
    content JSONB NOT NULL,
    text TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (conversation_id) REFERENCES conversations(uuid),
    FOREIGN KEY (parent_id) REFERENCES messages(uuid)
);

-- Attachments table
CREATE TABLE attachments (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(uuid),
  mime_type TEXT,
  storage TEXT,              -- 'local' | 's3'
  path TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX ON messages(conversation_id, created_at);
CREATE INDEX ON messages USING GIN (content jsonb_path_ops);
CREATE INDEX ON attachments(message_id);
```

## Development Conventions

- Direct SQL queries instead of ORM
- 2-space indentation
- Comprehensive error handling with retry mechanisms
- Clean test database for each test run

## Scripts

```json
{
  "scripts": {
    "start": "bun run app.js",
    "dev": "bun --watch run app.js",
    "db:reset": "bun run scripts/reset-db.js",
    "test": "bun test",
    "test:load": "bun run scripts/run-load-test.js",
    "test:api": "bun run test-api.js"
  }
}
```

## Project Stages

### ✅ Stage 1: A functioning and stable backend
Completed with all required functionality and tests.

### 🔄 Stage 2: AI chat UI resembling current meta (Next Steps)
- Develop frontend with conversation sidebar
- Implement standard chat interface
- Optimize rendering performance

### 🔄 Stage 3: Tree branching UI (Future)
- Implement visual tree structure for conversations
- Support multiple concurrent input boxes
- Use React-Flow for the canvas

## Testing

Tests have been implemented for:
- API endpoints validation
- Concurrent message handling
- Claude API integration
- Error scenarios

The test suite uses a dedicated `treechat_test` database that is reset before each test run for clean state. Tests randomly sample questions to verify AI response generation.

## Environment Configuration

The following environment variables are used:
- `PORT`: Server port (default: 3000)
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: Database connection
- `ANTHROPIC_API_KEY`: Claude API key
- `DEFAULT_MODEL`: Default AI model (claude-3-7-sonnet-20250219)
- `MAX_CONCURRENT_REQUESTS`: Limit for concurrent API requests

## Next Steps

1. Begin development of Stage 2 with the frontend implementation
2. Implement basic chat UI following modern designs
3. Connect frontend to the backend API
4. Implement conversation history and navigation

## Other Notes

1. File attachment support is implemented with local storage, future version will use S3
2. Current file size limit is 10MB
3. Rate limiting is implemented for shared API keys