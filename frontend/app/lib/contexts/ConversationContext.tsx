import React, { createContext, useContext, useState, useEffect } from 'react';
import apiClient, { Conversation, Message, Attachment } from '../api';

interface ConversationContextType {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: Message[];
  isLoading: boolean;
  isProcessing: boolean;
  error: string | null;
  refreshConversations: () => Promise<void>;
  setActiveConversation: (conversationId: string) => Promise<void>;
  sendMessage: (text: string, files?: File[], parentId?: string | null) => Promise<void>;
}

const ConversationContext = createContext<ConversationContextType | undefined>(undefined);

export function ConversationProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshConversations = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.getConversations();
      setConversations(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load conversations');
    } finally {
      setIsLoading(false);
    }
  };

  const loadConversation = async (conversationId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const conversation = await apiClient.getConversation(conversationId);
      const messagesData = await apiClient.getMessages(conversationId);
      setActiveConversation(conversation);
      setMessages(messagesData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load conversation');
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async (text: string, files?: File[], parentId: string | null = null) => {
    if (!activeConversation) return;
    
    setIsProcessing(true);
    setError(null);
    
    try {
      // Create the message
      const message = await apiClient.createMessage(
        activeConversation.uuid,
        text,
        parentId,
        true // Generate AI response
      );
      
      // Upload attachments if any
      if (files && files.length > 0) {
        for (const file of files) {
          await apiClient.uploadAttachment(message.uuid, file);
        }
      }
      
      // Refresh messages to get the new message and AI response
      const updatedMessages = await apiClient.getMessages(activeConversation.uuid);
      setMessages(updatedMessages);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send message');
    } finally {
      setIsProcessing(false);
    }
  };

  // Load initial conversations
  useEffect(() => {
    refreshConversations();
  }, []);

  return (
    <ConversationContext.Provider
      value={{
        conversations,
        activeConversation,
        messages,
        isLoading,
        isProcessing,
        error,
        refreshConversations,
        setActiveConversation: loadConversation,
        sendMessage,
      }}
    >
      {children}
    </ConversationContext.Provider>
  );
}

export function useConversation() {
  const context = useContext(ConversationContext);
  if (context === undefined) {
    throw new Error('useConversation must be used within a ConversationProvider');
  }
  return context;
}