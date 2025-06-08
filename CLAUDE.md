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
- Develop frontend with React + Remix (NOT Next.js)
- Implement conversation sidebar similar to ChatGPT/Claude
- Create custom-built core chat components:
  - Message input and response components
  - Conversation container and navigation
- Use shadcn/ui for auxiliary components (buttons, dropdowns, etc.)
- Match functionality of existing AI chat interfaces

### 🔄 Stage 2.1: Message Queue System
- Implement local queue system to handle API rate limits
- Add UI elements to inform users about throttling/rate limiting
- Implement persistence for queued messages to prevent message loss
- Create graceful recovery from API failures and timeouts
- Ensure seamless user experience despite backend limitations

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
- File attachment functionality

The test suite uses a dedicated `treechat_test` database that is reset before each test run for clean state. Tests randomly sample questions to verify AI response generation.

### Test Commands

```bash
# Run all tests
bun run test

# Run only the attachment tests
bun run test:attachment

# Run load tests
bun run test:load
```

### Known Testing Issues

The main API tests currently have issues with the attachment endpoints due to database connection management challenges. However, the dedicated attachment test (`test/attachment.test.js`) works properly and verifies that the attachment functionality is implemented correctly.

All other backend functionality is verified by the test suite, including:
- Conversation management
- Message creation and retrieval
- AI integration with Claude
- Concurrent request handling
- System metrics

## Recent Improvements

### Backend Improvements

We've completed several important fixes and improvements to the backend:

1. **Fixed Attachment Functionality**:
   - Implemented a dedicated test file for attachment tests that manages its own database connection
   - Modified the attachment model and service to correctly pass database context through the service chain
   - Ensured proper creation and verification of the attachments table
   - Fixed MIME type handling for file uploads

2. **Database Connection Management**:
   - Improved how database connections are handled in tests
   - Created a more robust testDatabaseFactory with support for manual connections
   - Enhanced error handling for database operations

3. **Test Infrastructure**:
   - Added specific test scripts for different components
   - Implemented proper database reset and cleanup
   - Added comprehensive logging for better debugging
   - Fixed concurrent test execution issues

### Frontend Implementation (Stage 2)

We've implemented the initial frontend structure using React and Remix:

1. **Project Setup**:
   - Initialized Remix project in the frontend directory
   - Set up Tailwind CSS for styling
   - Added shadcn/ui for auxiliary components
   - Configured directory structure for components, hooks, and utilities

2. **Core Components**:
   - `ConversationContainer`: Main chat interface with messages and input
   - `MessageInput`: Text input with attachment support
   - `MessageDisplay`: Renders AI and human messages with attachment handling
   - `ConversationSidebar`: Lists all conversations with navigation
   - `BranchNavigator`: Simple navigation between branches (precursor to Stage 3)

3. **Routing Structure**:
   - Home page (`/`): Landing page with links to start/view conversations
   - Conversations layout (`/conversations`): Main layout with sidebar
   - Individual conversation (`/conversations/:id`): Displays a specific conversation
   - New conversation (`/new`): Interface for starting a new conversation
   - Error boundary: Handles application errors gracefully

4. **API Integration**:
   - API client to communicate with the backend
   - Context provider for managing conversation state
   - Proper data fetching and error handling

5. **Next Steps**:
   - Implement message queue system (Stage 2.1)
   - Add streaming support
   - Enhance UI for branching conversations (Stage 3)

## Frontend Architecture (Stage 2)

### Technology Stack

- **Framework**: React + Remix
  - Remix for server-side rendering and data loading
  - React for component-based UI development
  - TypeScript for type safety

- **UI Components**:
  - Custom-built core components for the chat interface
  - shadcn/ui for auxiliary components (buttons, dropdowns, etc.)
  - Tailwind CSS for styling

- **Data Fetching**:
  - Remix loaders for server-side data fetching
  - Client-side fetching for real-time updates
  - Error boundaries for graceful error handling

- **State Management**:
  - React Context for global state
  - Local component state for UI-specific state
  - Form handling with Remix actions

### Component Architecture

1. **Core Components** (Custom Built):
   - `ConversationContainer`: Main chat interface
   - `MessageInput`: Text input with attachment support
   - `MessageDisplay`: Renders AI and human messages
   - `ConversationSidebar`: Lists all conversations
   - `BranchNavigator`: Simple navigation between branches (precursor to Stage 3)

2. **Auxiliary Components** (shadcn/ui):
   - Buttons, dropdowns, modals
   - Form elements
   - Notifications
   - Loading indicators

### Message Queue System

The message queue system will handle rate limiting and API failures:

1. **Client-side Queue**:
   - Queue messages when API rate limits are hit
   - Store queue in localStorage and/or IndexedDB
   - Attempt to retry with exponential backoff

2. **Server-side Persistence**:
   - Option to store pending messages in the database
   - Status indicators for message delivery state
   - Background processing for queued messages

3. **User Experience**:
   - Clear status indicators for message state (sending, queued, sent, failed)
   - Options to cancel queued messages
   - Estimated wait time display when appropriate

### Streaming Functionality

While not critical for the initial implementation, we will explore adding streaming support:

1. **Backend Integration**:
   - Adapt the existing Claude service to support streaming responses
   - Create a streaming-compatible endpoint in our API
   - Add proper error handling for streaming interruptions

2. **Frontend Implementation**:
   - Stream messages using Server-Sent Events (SSE) or WebSockets
   - Progressive rendering of AI responses as they arrive
   - UI indicators for streaming state (thinking, generating, completed)
   - Option to interrupt streaming responses

3. **Fallback Mechanism**:
   - Graceful degradation to non-streaming when not available
   - Seamless transition between streaming and non-streaming modes

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