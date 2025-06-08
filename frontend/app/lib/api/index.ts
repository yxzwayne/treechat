// Base API URL
const API_BASE_URL = process.env.API_URL || 'http://localhost:3000/api';

// Conversation types
export interface Conversation {
  uuid: string;
  summary: string;
  created_at: string;
  updated_at: string;
  status: string;
}

// Message types
export interface MessageContent {
  type: string;
  text: string;
}

export interface Message {
  uuid: string;
  conversation_id: string;
  parent_id: string | null;
  sender: 'human' | 'ai' | 'system';
  model_provider: string | null;
  content: MessageContent[];
  text: string;
  created_at: string;
  updated_at: string;
}

// Attachment types
export interface Attachment {
  uuid: string;
  message_id: string;
  mime_type: string;
  storage: string;
  path: string;
  created_at: string;
}

/**
 * API Client for interacting with the backend
 */
export class ApiClient {
  private baseUrl: string;
  
  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }
  
  /**
   * Get all conversations
   */
  async getConversations(): Promise<Conversation[]> {
    const response = await fetch(`${this.baseUrl}/conversations`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch conversations: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  /**
   * Get a single conversation by ID
   */
  async getConversation(id: string): Promise<Conversation> {
    const response = await fetch(`${this.baseUrl}/conversations/${id}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch conversation: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  /**
   * Create a new conversation
   */
  async createConversation(summary: string): Promise<Conversation> {
    const response = await fetch(`${this.baseUrl}/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ summary }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create conversation: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  /**
   * Get all messages for a conversation
   */
  async getMessages(conversationId: string): Promise<Message[]> {
    const response = await fetch(`${this.baseUrl}/messages/conversation/${conversationId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch messages: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  /**
   * Create a new message
   */
  async createMessage(
    conversationId: string, 
    text: string, 
    parentId: string | null = null,
    generateAiResponse: boolean = true
  ): Promise<Message> {
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversation_id: conversationId,
        parent_id: parentId,
        sender: 'human',
        content: [{ type: 'text', text }],
        text,
        generate_ai_response: generateAiResponse,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create message: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  /**
   * Upload an attachment for a message
   */
  async uploadAttachment(messageId: string, file: File): Promise<Attachment> {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${this.baseUrl}/attachments/message/${messageId}`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error(`Failed to upload attachment: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  /**
   * Get attachments for a message
   */
  async getAttachments(messageId: string): Promise<Attachment[]> {
    const response = await fetch(`${this.baseUrl}/attachments/message/${messageId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch attachments: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  /**
   * Get attachment download URL
   */
  getAttachmentUrl(attachmentId: string): string {
    return `${this.baseUrl}/attachments/${attachmentId}/file`;
  }
}

// Create and export default API client instance
const apiClient = new ApiClient();
export default apiClient;