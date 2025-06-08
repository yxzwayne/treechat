import { useRef, useEffect } from "react";
import { MessageDisplay } from "./MessageDisplay";
import { MessageInput } from "./MessageInput";

interface Attachment {
  id: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
}

interface Message {
  id: string;
  role: "human" | "ai" | "system";
  content: string;
  createdAt: string;
  attachments?: Attachment[];
}

interface ConversationContainerProps {
  messages: Message[];
  onSendMessage: (message: string, attachments?: File[]) => void;
  isProcessing?: boolean;
  title?: string;
}

export function ConversationContainer({
  messages,
  onSendMessage,
  isProcessing = false,
  title,
}: ConversationContainerProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex h-full flex-col">
      {title && (
        <header className="border-b">
          <div className="mx-auto flex h-16 max-w-3xl items-center px-4">
            <h1 className="text-lg font-semibold">{title}</h1>
          </div>
        </header>
      )}
      <div className="flex-1 overflow-auto">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8 text-center">
            <div className="max-w-md space-y-4">
              <h2 className="text-2xl font-bold">Welcome to Treechat</h2>
              <p className="text-neutral-500 dark:text-neutral-400">
                Start a conversation by typing a message below.
              </p>
            </div>
          </div>
        ) : (
          <div>
            {messages.map((message) => (
              <MessageDisplay key={message.id} message={message} />
            ))}
            {isProcessing && (
              <MessageDisplay
                message={{
                  id: "loading",
                  role: "ai",
                  content: "",
                  createdAt: new Date().toISOString(),
                }}
                isLoading
              />
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      <MessageInput
        onSendMessage={onSendMessage}
        disabled={isProcessing}
      />
    </div>
  );
}