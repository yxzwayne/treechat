#!/usr/bin/env bun
/**
 * Database reset script for testing
 * 
 * This script:
 * 1. Drops the test database if it exists
 * 2. Creates a fresh test database
 * 3. Creates schema and tables
 * 4. Adds indexes and triggers
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);
const DB_NAME = 'treechat_test';
const DB_USER = 'wayne'; // Same as in database.js

async function runCommand(command) {
  try {
    const { stdout, stderr } = await execAsync(command);
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
    return true;
  } catch (error) {
    console.error(`Error executing command: ${command}`);
    console.error(error);
    return false;
  }
}

async function resetDatabase() {
  console.log(`Resetting database: ${DB_NAME}`);
  
  // Check if database exists
  const checkDb = await runCommand(`psql -U ${DB_USER} -lqt | cut -d \\| -f 1 | grep -qw ${DB_NAME}`);
  
  // Drop database if it exists
  if (checkDb === false) {
    console.log(`Database ${DB_NAME} does not exist. Creating...`);
  } else {
    console.log(`Dropping existing database ${DB_NAME}...`);
    await runCommand(`dropdb -U ${DB_USER} ${DB_NAME}`);
  }
  
  // Create database
  console.log(`Creating database ${DB_NAME}...`);
  const createResult = await runCommand(`createdb -U ${DB_USER} ${DB_NAME}`);
  if (!createResult) {
    console.error('Failed to create database. Exiting.');
    process.exit(1);
  }
  
  // Read schema file
  const schemaPath = path.join(process.cwd(), '..', 'sqlscripts', 'schema.sql');
  const attachmentsPath = path.join(process.cwd(), 'scripts', 'attachments.sql');
  
  // Execute schema
  console.log('Applying schema...');
  await runCommand(`psql -U ${DB_USER} -d ${DB_NAME} -f ${schemaPath}`);
  
  // Create attachments table if it doesn't exist in schema
  try {
    fs.accessSync(attachmentsPath, fs.constants.F_OK);
    console.log('Applying attachments schema...');
    await runCommand(`psql -U ${DB_USER} -d ${DB_NAME} -f ${attachmentsPath}`);
  } catch (err) {
    console.log('Attachments schema not found. Creating default attachments table...');
    await runCommand(`psql -U ${DB_USER} -d ${DB_NAME} -c "
      CREATE TABLE IF NOT EXISTS attachments (
        uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id UUID NOT NULL REFERENCES messages(uuid),
        mime_type TEXT,
        storage TEXT DEFAULT 'local',
        path TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON attachments(message_id);
    "`);
  }
  
  // Add missing indexes
  console.log('Adding additional indexes...');
  await runCommand(`psql -U ${DB_USER} -d ${DB_NAME} -c "
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at ON messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_content_gin ON messages USING GIN (content jsonb_path_ops);
  "`);
  
  console.log(`Database ${DB_NAME} reset successfully!`);
}

// Run the script
resetDatabase().catch(err => {
  console.error('Error resetting database:', err);
  process.exit(1);
});