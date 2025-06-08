# Treechat Server

This is a backend API server for the Treechat application built with Koa.js, PostgreSQL, and Bun. It provides a tree-structured chat interface with AI integration.

## Prerequisites

- [Bun](https://bun.sh/)
- PostgreSQL database
- Claude API key (or other supported AI provider)

## Setup

1. Install dependencies:
   ```bash
   bun install
   ```

2. Set up the database:
   ```bash
   # Create the database if it doesn't exist
   createdb treechat
   
   # Run the schema script to create tables
   psql -d treechat -f ../sqlscripts/schema.sql
   
   # Add attachments table
   psql -d treechat -f scripts/attachments.sql
   ```

3. Configure environment:
   - Copy `.env.example` to `.env` and update with your settings:
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials and API keys
   ```

## Running the server

```bash
# Development mode with auto-reload
bun run dev

# Production mode
bun run start

# Reset test database
bun run db:reset
```

The server will start on http://localhost:3000 by default.

## Testing

Run tests with:

```bash
# Run all tests
bun test

# Run specific test file
bun test test/api.test.js

# Run Claude API integration tests
bun test test/claude.test.js
```

## API Endpoints

### Conversations

- `GET /api/conversations` - Get all conversations
- `POST /api/conversations` - Create a new conversation
- `GET /api/conversations/:uuid` - Get a specific conversation
- `GET /api/conversations/:uuid/messages` - Get a conversation with its messages
- `PUT /api/conversations/:uuid` - Update a conversation

### Messages

- `GET /api/messages/:uuid` - Get a specific message
- `GET /api/messages/conversation/:conversationId` - Get all messages for a conversation
- `POST /api/messages` - Create a new message with options to generate AI response

### Attachments

- `GET /api/attachments/:uuid` - Get attachment metadata
- `GET /api/attachments/:uuid/file` - Download the attachment file
- `GET /api/attachments/message/:messageId` - Get all attachments for a message
- `POST /api/attachments/message/:messageId` - Upload an attachment for a message
- `DELETE /api/attachments/:uuid` - Delete an attachment

### Metrics

- `GET /api/metrics` - Get system and API usage metrics

## Example Requests

### Create a conversation

```bash
curl -X POST http://localhost:3000/api/conversations \
  -H "Content-Type: application/json" \
  -d '{"summary": "New chat conversation"}'
```

### Create a message with AI response

```bash
curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -d '{
    "conversation_id": "<conversation-uuid>",
    "sender": "human",
    "content": {"text": "What is quantum computing?"},
    "text": "What is quantum computing?",
    "generate_response": true,
    "model_provider": "claude"
  }'
```

### Upload a file attachment

```bash
curl -X POST http://localhost:3000/api/attachments/message/<message-uuid> \
  -F "file=@/path/to/file.pdf"
```

### Get a conversation with messages

```bash
curl http://localhost:3000/api/conversations/<conversation-uuid>/messages
```

## Project Structure

```
server/
├── app.js             # Main application entry point
├── config/            # Configuration files
├── controllers/       # API controllers
├── middlewares/       # Koa middleware
├── models/            # Database models
├── routes/            # API routes
├── scripts/           # Utility scripts
├── services/          # Business logic
│   └── providers/     # AI provider integrations
├── test/              # Tests
└── uploads/           # File upload storage
```

See the [OpenAPI spec](./openapi.yaml) for complete API documentation.
