CREATE TABLE IF NOT EXISTS Role (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description TEXT
);

-- CREATE TABLE IF NOT EXISTS User (
--     id VARCHAR(36) PRIMARY KEY,
--     email VARCHAR(255) NOT NULL UNIQUE,
--     password_hash VARCHAR(255) NOT NULL,
--     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );
-- -- Create a trigger to update the updated_at column for User table
-- CREATE TRIGGER update_user_modtime BEFORE
-- UPDATE
--     ON User FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TABLE IF NOT EXISTS Model (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS Conversation (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_id VARCHAR(36) NOT NULL,
    root_message_id VARCHAR(36),
    FOREIGN KEY (user_id) REFERENCES User(id),
    FOREIGN KEY (root_message_id) REFERENCES Message(id)
);

-- Create a function to update the updated_at column
CREATE
OR REPLACE FUNCTION update_modified_column() RETURNS TRIGGER AS $ $ BEGIN NEW.updated_at = CURRENT_TIMESTAMP;

RETURN NEW;

END;

$ $ LANGUAGE plpgsql;

-- Create a trigger to call the function before each update
CREATE TRIGGER update_conversation_modtime BEFORE
UPDATE
    ON Conversation FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TABLE IF NOT EXISTS Message (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    conversation_id VARCHAR(36) NOT NULL,
    role_id VARCHAR(36) NOT NULL,
    model_id VARCHAR(36) NOT NULL,
    type VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    parent_id VARCHAR(36),
    FOREIGN KEY (conversation_id) REFERENCES Conversation(id),
    FOREIGN KEY (role_id) REFERENCES Role(id),
    FOREIGN KEY (model_id) REFERENCES Model(id),
    FOREIGN KEY (parent_id) REFERENCES Message(id)
);

ALTER TABLE
    Conversation
ADD
    CONSTRAINT fk_root_message FOREIGN KEY (root_message_id) REFERENCES Message(id);

CREATE INDEX idx_message_conversation ON Message(conversation_id);

CREATE INDEX idx_message_parent ON Message(parent_id);