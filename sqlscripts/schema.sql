-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
CREATE TABLE IF NOT EXISTS attachments (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(uuid),
    mime_type TEXT,
    storage TEXT DEFAULT 'local',
    path TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_parent_id ON messages(parent_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_conversations_created_at ON conversations(created_at);
CREATE INDEX idx_attachments_message_id ON attachments(message_id);
CREATE INDEX idx_attachments_storage ON attachments(storage);

-- Trigger function for timestamps
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER update_messages_timestamp
BEFORE UPDATE ON messages
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_conversations_timestamp
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_attachments_timestamp
BEFORE UPDATE ON attachments
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();