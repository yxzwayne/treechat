# TreeChat

TreeChat is a chat application that supports branching conversations with Claude AI. It uses Remix for the frontend, Koa.js for the backend, and PostgreSQL for storage.

## Project Structure

- `frontend/`: Remix application
- `server/`: Koa.js backend
- `sqlscripts/`: Database schema

## Development:

- Start the server:

```bash
cd server && bun run dev
```

- Start the frontend:

```bash
cd frontend && bun run dev
```

## Setup

### Prerequisites

- Node.js / Bun runtime
- PostgreSQL installed and running
- Anthropic API key

### Database Setup

1. Create a PostgreSQL database named `treechat`:

```bash
createdb treechat
```

2. Run the schema script:

```bash
psql -d treechat -f sqlscripts/schema.sql
```

### Backend Setup

1. Navigate to the server directory:

```bash
cd server
```

2. Install dependencies:

```bash
bun install
```

3. Create a `.env` file with your Anthropic API key:

```
ANTHROPIC_API_KEY=your_api_key_here
```

4. Start the server:

```bash
bun run dev
```

The server will run on http://localhost:3000.

### Frontend Setup

1. Navigate to the frontend directory:

```bash
cd frontend
```

2. Install dependencies:

```bash
bun install
```

3. Start the frontend:

```bash
bun run dev
```

The frontend will run on http://localhost:4999.

## Features

- Create and manage conversations
- Send messages and receive responses from Claude
- Tree-structured conversations (reply to any previous message)
- Display conversation history as a tree

## API Endpoints

- `GET /conversations`: List all conversations
- `POST /conversations`: Create a new conversation
- `GET /conversations/:id/messages`: Get all messages in a conversation
- `POST /conversations/:id/messages`: Send a message and get a response from Claude

This project was created using `bun init` in bun v1.1.29. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
