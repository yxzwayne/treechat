import { fetch } from 'bun';

const BASE_URL = 'http://localhost:3000';

// Helper function to log responses
async function logResponse(response) {
  const json = await response.json();
  console.log(JSON.stringify(json, null, 2));
  return json;
}

async function testAPI() {
  try {
    console.log('\n--- Testing Conversation API ---\n');
    
    // Create a conversation
    console.log('Creating a conversation...');
    const createConvRes = await fetch(`${BASE_URL}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: 'Test conversation' })
    });
    
    const conversation = await logResponse(createConvRes);
    const conversationId = conversation.uuid;
    
    // Get all conversations
    console.log('\nFetching all conversations...');
    const getConvsRes = await fetch(`${BASE_URL}/api/conversations`);
    await logResponse(getConvsRes);
    
    // Create a message
    console.log('\nCreating a message...');
    const createMsgRes = await fetch(`${BASE_URL}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: conversationId,
        sender: 'human',
        content: { type: 'text', value: 'Hello world' },
        text: 'Hello world'
      })
    });
    
    const message = await logResponse(createMsgRes);
    const messageId = message.uuid;
    
    // Get conversation with messages
    console.log('\nFetching conversation with messages...');
    const getConvMsgsRes = await fetch(`${BASE_URL}/api/conversations/${conversationId}/messages`);
    await logResponse(getConvMsgsRes);
    
    // Get specific message
    console.log('\nFetching specific message...');
    const getMsgRes = await fetch(`${BASE_URL}/api/messages/${messageId}`);
    await logResponse(getMsgRes);
    
    // Update conversation
    console.log('\nUpdating conversation...');
    const updateConvRes = await fetch(`${BASE_URL}/api/conversations/${conversationId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        summary: 'Updated conversation summary',
        status: 'archived'
      })
    });
    
    await logResponse(updateConvRes);
    
    console.log('\n--- API Testing Complete ---');
  } catch (error) {
    console.error('Error testing API:', error);
  }
}

testAPI();