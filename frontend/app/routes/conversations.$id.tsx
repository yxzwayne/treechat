import { useEffect, useState } from "react";
import { useParams, useLoaderData } from "@remix-run/react";
import { json, LoaderFunctionArgs } from "@remix-run/node";
import { useConversation } from "~/lib/contexts/ConversationContext";
import { ConversationContainer } from "~/components/core/ConversationContainer";
import { BranchNavigator } from "~/components/core/BranchNavigator";
import apiClient from "~/lib/api";

// Loader function to fetch data server-side
export async function loader({ params }: LoaderFunctionArgs) {
  const conversationId = params.id;
  
  if (!conversationId) {
    throw new Response("Conversation ID is required", { status: 400 });
  }
  
  try {
    // Fetch conversation and messages
    const [conversation, messages] = await Promise.all([
      apiClient.getConversation(conversationId),
      apiClient.getMessages(conversationId),
    ]);
    
    return json({ conversation, messages });
  } catch (error) {
    throw new Response("Failed to load conversation", { status: 500 });
  }
}

export default function ConversationPage() {
  const { id } = useParams();
  const { conversation, messages: initialMessages } = useLoaderData<typeof loader>();
  const { 
    setActiveConversation, 
    messages: contextMessages, 
    isProcessing, 
    sendMessage 
  } = useConversation();
  
  // Local state for branches
  const [branches, setBranches] = useState<{ id: string; messageId: string; title: string }[]>([]);
  const [currentBranchId, setCurrentBranchId] = useState<string | undefined>();
  
  // Use either the context messages or initial messages
  const messages = contextMessages.length > 0 ? contextMessages : initialMessages;
  
  // Set the active conversation when the component mounts or ID changes
  useEffect(() => {
    if (id) {
      setActiveConversation(id);
    }
  }, [id, setActiveConversation]);
  
  // Organize messages into branches (simplified for now)
  useEffect(() => {
    if (messages.length > 0) {
      // For now, we'll just create a single branch with all messages
      // In Stage 3, we'll implement proper branching
      setBranches([{
        id: "main",
        messageId: messages[0].uuid,
        title: "Main Branch"
      }]);
      setCurrentBranchId("main");
    }
  }, [messages]);
  
  // Map backend message data to component props
  const displayMessages = messages.map(msg => ({
    id: msg.uuid,
    role: msg.sender,
    content: msg.text,
    createdAt: msg.created_at,
    // We'll add attachments in a future implementation
    attachments: []
  }));
  
  const handleSendMessage = (text: string, files?: File[]) => {
    if (id) {
      // For now, we don't implement branching, so parentId is always null
      sendMessage(text, files);
    }
  };
  
  const handleSelectBranch = (branchId: string) => {
    setCurrentBranchId(branchId);
    // In Stage 3, we'll implement actual branch switching
  };
  
  return (
    <div className="relative flex h-full flex-col">
      <ConversationContainer
        messages={displayMessages}
        onSendMessage={handleSendMessage}
        isProcessing={isProcessing}
        title={conversation.summary || "Conversation"}
      />
      
      {branches.length > 1 && (
        <BranchNavigator
          branches={branches}
          currentBranchId={currentBranchId}
          onSelectBranch={handleSelectBranch}
        />
      )}
    </div>
  );
}