# Treechat revival plan

This project is the crown jewel side project of mine before I got incredibly busy at work. It has been months since I touch anything in it.

## Motivation

> I should be able to fork my conversation with a chatbot.
> – Adam Rankin

Current AI chat interfaces for ANY AI products (Chatgpt, Claude, Deepsee) already have mature UX for creating new forks to conversations, but the branches are never fully visualized, simply hidden behind some toggling left and right arrows at best. Nobody has tried to tackle the challenge of providing a coherent, usable and modern UI+UX for viewing chats as trees, so this is what I want to do.

## Loose notes on its functionality

When i am writing a prompt, i typically can think of some new prompts related to the one i am writing and i want to note it down, but i also don't want to just delete all my existing ones. it would be nice if the interface can hold stuff for me.

- add a "fork prompt here" button, that will simply create another input box for the user to type in.
- this feature means we need to cache all input content that is not being sent yet. update some data structure after every keystroke, and batch store 10 keystroke to cache.

I want to roll my own stacks for an ai chat interface for the purpose of fully localizing my chat histories and everything, this project precedes that in scope, in that this should be a strictly front-end interface work: we will be using AI provider's APIs. For now, let's use Claude. It seems to also involve how i should store my chats. so i need to store the following:

- conversations
- the messages in a conversation
- which message follows which message (i.e. what is this message's parent or children?) note that each message can only have one parent but can have multiple children

The idea is that when the page loads for the user, it should

- check if the localstorage cached conversations, if it hasn't, query the conversation table
- only if the user clicks a message page do we start querying and caching that conversation's messages.
- once we get all messages, how do we render them? this is saved for later.

This app needs to handle both Claude and Bedrock APIs. In the future, will need to expand support to major API providers:

- Chatgpt
- Deepseek
- Google Gemini
- AllenAI models hosted on the best platform (this is the farthest goal right now)
  For now, we don't need to add support for any of those.

### Difference between local and session storage?

- Use localStorage if you want conversations to persist between sessions/browser restarts
- Use sessionStorage if you only need them during the current browser session
  Given the goal of "fully localizing chat histories," localStorage is likely what I want.

## Building the tree

When implementing a tree-structured chat, the fundamental question becomes: how should we store the relationship between messages?
I had two main options:

1. Each message stores its parent ID (child → parent relationship)
2. Each message stores an array of child IDs (parent → children relationship)
   With the parent ID approach, each message would reference its parent message through a foreign key:

```sql
CREATE TABLE messages (
	id SERIAL PRIMARY KEY,
	conversation_id INT NOT NULL,
	content TEXT NOT NULL,
	parent_id INT,
	created_at TIMESTAMP DEFAULT NOW(),
	FOREIGN KEY (parent_id) REFERENCES messages(id)
);
```

Advantages:

- Simple writes: Adding a new message just requires one INSERT with the correct parent_id
- Efficient reads: PostgreSQL's recursive CTEs are perfect for traversing parent-based trees
- Consistency: The relationship is maintained as long as the parent exists
  For tree traversal, I could use a recursive CTE:

```sql
WITH RECURSIVE conversation_tree AS (
	-- Start with root message
	SELECT id, content, parent_id, created_at
	FROM messages
	WHERE parent_id IS NULL AND conversation_id = 1
	UNION ALL
	-- Join with child messages
	SELECT m.id, m.content, m.parent_id, m.created_at
	FROM messages m JOIN conversation_tree ct ON m.parent_id = ct.id
)
SELECT * FROM conversation_tree ORDER BY created_at;
```

I will go with the `parent_id` approach.
Another consideration is that I will use more than one providers, right now I already think about supporting both Claude and Bedrock, so the intuitively most flexible schema stores the entire API response into one big json field in a `message` and wrap our own needed fields around it. This way, koa.js can intercept the ctx.response, check whether id or uuid is uuid or not, do some manipulations before finally inserting the message into the database.

The first version of the schema i settled for is:

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
```

## Sample data

I have collected a few entries of conversations stored in `data_sample_extracted.json` under project root. I want to modfiy the template that we will use to be based off this, but ever so slightly different.

# Current status

Before I left off, I sort of put together a rudimentary Bun and Koa.js for backend, but I'm not sure of its functionality anymore and I don't know if it's stable or even usable. We did not go ahead with any frontend progress, but I think we should go with using Remix. I will not use Next.js. I also defined a data schema that I will manually copy paste into a fresh postgresql instance. Obviously this is very inefficient. Just for testing purposes, I hope you can implement a script to destroy and (re-) create a clean test database named specifically with "\_test" suffix to distinguish itself from possible in-use databases. My local PostgreSQL has

# Development Conventions

We will not use ORMs! We will write SQL scripts to interact interact with the Postgresql directly.

NPM scripts:

```
{
  "scripts": {
    "dev": "bun run src/index.ts",
    "db:reset": "bun run scripts/reset-db.ts",     // drops & recreates *_test DBs
    "migrate": "bunx drizzle-kit push",
    "test": "bun test && vitest run",
    "bench": "bun run scripts/bench.ts"
  }
}
```

Database additions:

```sql
CREATE TABLE attachments (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(uuid),
  mime_type TEXT,
  storage TEXT,              -- 'local' | 's3'
  path TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX ON messages(conversation_id, created_at);
CREATE INDEX ON messages USING GIN (content jsonb_path_ops);
```

# Project stages

Each of the stages of this project should have a clear cut-off of functionalities that are self-contained and can be independently tested up to that point, meaning if we finished step 1, then we should be able to test what step 1 does, then if we finished step 2, we should run tests for both step 1 and 2. At each stage, make code commits before major change, run tests, and inform me for the results. We should write the appropriate corresponding unit tests for each stage for the respective framework we use.
Your task before doing any of the following is:

- determine the most basic test runner for both frontend and backend.
- keep in mind we don't actually need dedicated load-tests
- include quick test commands, such as `make test` (if you are going to use make, but let's hope not!) such that you can quickly invoke it.

## Stage 1: A functioning and stable backend

In this stage, we develop and finish the backend server and the local database (in postgres) that will be the backend to the frontend interface we are developing. By the end of it, we should be able to call the server many times to simulate how our frontend will send text prompts and files to the provider API.
One work item I can think of in this section is to design the APIs and the backend functions, such as constructing the tree conversation structure, that may or maynot be different from how AI chat conversations are stored currently.
The testing in this stage will include many API calls and making sure we can handle up to 100 concurrent API calls, this way, when a user has many branches, the server won't get overloaded. Honestly I think we're just talking about a bread and butter high throughput low latency regular web server.
In this stage, we need to begin with listing each planned HTTP endpoint with method /path, req/resp JSON shape, and error schema. We also need to consider adding DB index plan (conversation_id, parent_id, created_at, content gin) and migration strategy.
Stage 1 is done when 100 parallel `POST /message` calls are able to finish without error on our side (this is to say, we don't count when the API request themselves time out or receives 500 that's not our fault).

## Stage 2: Have a complete, working AI chat UI that resembles the current meta

In this stage, we develop and finish the frontend to be the same as major AI chat UI providers. Think ChatGPT. The interface will have: conversation histories in the hovering left sidebar, and when we select or create a conversation, the conversation page shows one conversation, from start to end from top to bottom. However, instead of hiding branches behind left and right arrows, we straight up do not consider it at this stage and pretend we don't support branching. One pet peeve I have with modern UI is that it's so slow! We are building a text app, and even if a user opens a conversation with let's say a million tokens, it shouldn't take performance down so much. Think about how that optimization happens when we are rendering text on a webpage.
For this stage, we need to first specify props and events for the chat component and for the tree canvas.
For our front-end state manager, I want to keep it as little boilerplate as possible. If Remix loaders + React context fit this description, give it a go.
The testing in this stage will test the frontend functionalities: can conversation histories load, do all the interactions (i.e. clicking one from the history to open that chat) work, and if we send prompts via frontend, will there be any problems with frontend backend communication, will the backend correctly call API, will the result be correctly and timely handled, will errors be handled.

## Stage 3: Have a working tree branching UI

This stage is the essense of this project. Having a branching UI sets us truly apart from any other AI chat UI. While I already have a /template/infinicanvas.html as a proof-of-concept, I actually don't think an infinite canvas is needed: think about this, all we care about, is that the rendered tree correctly reflects the order of each turns (i.e. earlier turns must be higher (above) than its children messages, new branches are to the right of older branches at the same level), and messages have an aesthetic arrows or some sort of connection lines between them. As long as this is achieved it's good. For the canvas library, let's give React-Flow a try. The goal is to be able to open many new empty input boxes and send many requests and receive their outputs simutaneously. The test in this stage don't need to be too complicated: if we can open a conversation, and it renders without giving out error, and we can send multiple requests from multiple input boxes, and these requests can give responses and the front-end can obtain those responses and parse them into the interface at the same time, that would be good.
In this stage's unit tests, we can consider including a perf budget test: a moderate conversation with 10 messages, 2000 tokens each turn, should take no more than 500ms.

# Agent workflow

1. Create and consolidate openapi.yaml → regenerate route stubs if changed.
2. Migrate: run `bun migrate` to sync schema.
3. Code: implement feature.
4. Test: npm test — must pass DoD gate.
5. Commit: use the commit message template format "Claude Code commit: {description}".

# Agent contract

- You will receive documentations (such as this md) and the repo itself
- You must answer in diffs against main
- use 2 space tabs
- error handling should adhere to the philosophy that we always retry with minimal backoff. Since it's a possibility to get throttled on API, we should probably also have a message queue mechanism that we implement locally. no need to use any out of the box service. For other errors, we adhere to the principle of not interfering with general usage.

Now that you have finished this guide, you should feel free to modify any part of this to get rid of initial instructions and update new information and decisions you made during any progress, this may include what commands to run what tests so that you can run it, etc. Here are some stuff to get started:

1. Your first task for now is read this doc, start working.
2. double check: is the data schema I listed above coherent with what we have in this local file?
3. After the above two, start development with stage 1.

# Unresolved items

1. We will support files, so let's add an attachment table to record the local file paths of the upload. In the future, this table will need to be s3 paths.
2. We will not consider adding full-text search (pgvector similarity?) for now. DO not ever mention it proactively.
3. File uploads > 10 MB will require background worker. Not in scope.
4. Rate‑limit strategy for shared provider keys. Not in scope unless rate limit hit.
