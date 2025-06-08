import { useState } from "react";
import { useNavigate } from "@remix-run/react";
import { ActionFunctionArgs, redirect } from "@remix-run/node";
import { MessageInput } from "~/components/core/MessageInput";
import apiClient from "~/lib/api";

// Server action to create a new conversation
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const message = formData.get("message") as string;
  
  if (!message || typeof message !== "string") {
    return { error: "Message is required" };
  }
  
  try {
    // Create a new conversation with a generic summary
    const conversation = await apiClient.createConversation("New Conversation");
    
    // Create the first message
    await apiClient.createMessage(conversation.uuid, message, null, true);
    
    // Redirect to the new conversation
    return redirect(`/conversations/${conversation.uuid}`);
  } catch (error) {
    return { error: "Failed to create conversation" };
  }
}

export default function NewConversation() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  
  const handleSubmit = async (message: string, files?: File[]) => {
    setIsSubmitting(true);
    
    try {
      // Create a new conversation
      const conversation = await apiClient.createConversation("New Conversation");
      
      // Create the first message
      await apiClient.createMessage(conversation.uuid, message, null, true);
      
      // Upload attachments if any
      if (files && files.length > 0) {
        // For this to work, we'd need to get the message ID from the createMessage response
        // This is a simplified version for now
      }
      
      // Navigate to the new conversation
      navigate(`/conversations/${conversation.uuid}`);
    } catch (error) {
      console.error("Failed to create conversation:", error);
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="flex h-screen flex-col">
      <header className="border-b">
        <div className="container flex h-16 items-center">
          <h1 className="text-2xl font-bold">New Conversation</h1>
        </div>
      </header>
      <main className="flex-1">
        <div className="container flex h-full flex-col">
          <div className="flex flex-1 items-center justify-center">
            <div className="max-w-md space-y-4 text-center">
              <h2 className="text-2xl font-bold">Start a New Conversation</h2>
              <p className="text-neutral-500 dark:text-neutral-400">
                Type your message below to begin chatting with the AI.
              </p>
            </div>
          </div>
          <div className="pb-8">
            <MessageInput
              onSendMessage={handleSubmit}
              disabled={isSubmitting}
              placeholder="Type your message to start a new conversation..."
            />
          </div>
        </div>
      </main>
    </div>
  );
}