#!/usr/bin/env bun
/**
 * Import sample data script
 * 
 * This script:
 * 1. Reads sample data from data_sample_extracted.json
 * 2. Imports conversations and messages into the database
 * 3. Preserves the message tree structure
 */

import fs from 'fs';
import path from 'path';
import sql from '../config/database.js';

// Configure paths
const SAMPLE_DATA_PATH = path.join(process.cwd(), '..', 'data_sample_extracted.json');

async function importSampleData() {
  console.log('Importing sample data...');
  
  try {
    // Read sample data
    const rawData = fs.readFileSync(SAMPLE_DATA_PATH, 'utf8');
    const sampleData = JSON.parse(rawData);
    
    console.log(`Found ${sampleData.length} conversations to import`);
    
    for (const conversation of sampleData) {
      console.log(`Importing conversation: ${conversation.name} (${conversation.uuid})`);
      
      // Check if conversation already exists
      const existingConversation = await sql`
        SELECT * FROM conversations WHERE uuid = ${conversation.uuid}
      `;
      
      if (existingConversation.length > 0) {
        console.log(`Conversation ${conversation.uuid} already exists, skipping...`);
        continue;
      }
      
      // Insert conversation
      await sql`
        INSERT INTO conversations (
          uuid, summary, created_at, updated_at, status
        ) VALUES (
          ${conversation.uuid}, 
          ${conversation.name}, 
          ${conversation.created_at}, 
          ${conversation.updated_at}, 
          'active'
        )
      `;
      
      // Track message parents for building the tree
      const messageParents = new Map();
      
      // Insert messages in chronological order to preserve parent relationships
      const messages = conversation.chat_messages.sort((a, b) => 
        new Date(a.created_at) - new Date(b.created_at)
      );
      
      console.log(`Importing ${messages.length} messages...`);
      
      // First pass: insert all messages without parent references
      for (const message of messages) {
        // Format content as JSONB
        const content = message.content;
        
        // Map 'assistant' to 'ai' since our enum only has 'human', 'ai', 'system'
        const sender = message.sender === 'assistant' ? 'ai' : message.sender;
        
        await sql`
          INSERT INTO messages (
            uuid, conversation_id, sender, model_provider, content, text, created_at, updated_at
          ) VALUES (
            ${message.uuid}, 
            ${conversation.uuid}, 
            ${sender}, 
            NULL, 
            ${content}, 
            ${message.text}, 
            ${message.created_at}, 
            ${message.updated_at}
          )
        `;
      }
      
      // Second pass: build parent-child relationships based on created_at timestamps
      // This is a simplification; in real data we would need proper parent_id values
      let prevMessage = null;
      for (const message of messages) {
        if (prevMessage && prevMessage.sender !== message.sender) {
          // If sender changed, set parent relationship
          await sql`
            UPDATE messages
            SET parent_id = ${prevMessage.uuid}
            WHERE uuid = ${message.uuid}
          `;
        }
        prevMessage = message;
      }
      
      console.log(`Imported conversation ${conversation.uuid} with ${messages.length} messages`);
    }
    
    console.log('Sample data import completed successfully!');
  } catch (error) {
    console.error('Error importing sample data:', error);
  }
}

// Run the import
importSampleData()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });