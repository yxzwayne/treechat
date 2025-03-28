# Treechat Server

This is a backend API server for the Treechat application built with Koa.js and PostgreSQL.

## Prerequisites

- [Bun](https://bun.sh/)
- PostgreSQL database

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
   ```

3. Configure database connection:
   - Modify `config/database.js` with your database credentials if needed.

## Running the server

```bash
# Development mode with auto-reload
bun run dev

# Production mode
bun run start
```

The server will start on http://localhost:3000 by default.

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
- `POST /api/messages` - Create a new message

## Example Requests

### Create a conversation

```bash
curl -X POST http://localhost:3000/api/conversations \
  -H "Content-Type: application/json" \
  -d '{"summary": "New chat conversation"}'
```

### Create a message

```bash
curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -d '{
    "conversation_id": "<conversation-uuid>",
    "sender": "human",
    "content": {"type": "text", "value": "Hello world"},
    "text": "Hello world"
  }'
```

### Get all conversations

```bash
curl http://localhost:3000/api/conversations
```

### Get a conversation with messages

```bash
curl http://localhost:3000/api/conversations/<conversation-uuid>/messages
```
