-- Attachments table for file uploads
CREATE TABLE IF NOT EXISTS attachments (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(uuid),
  mime_type TEXT,
  storage TEXT DEFAULT 'local',
  path TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create trigger for updated_at
CREATE TRIGGER update_attachments_timestamp
BEFORE UPDATE ON attachments
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_attachments_storage ON attachments(storage);