import { useState } from "react";
import { Paperclip } from "lucide-react";
import { cn } from "~/lib/utils";

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

interface MessageDisplayProps {
  message: Message;
  isLoading?: boolean;
}

export function MessageDisplay({ message, isLoading = false }: MessageDisplayProps) {
  const [showAttachments, setShowAttachments] = useState(false);
  
  return (
    <div
      className={cn(
        "px-4 py-6 border-b",
        message.role === "human" ? "bg-white dark:bg-neutral-950" : "bg-neutral-50 dark:bg-neutral-900"
      )}
    >
      <div className="mx-auto flex max-w-3xl gap-4">
        <div className="shrink-0 mt-1">
          <div 
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md",
              message.role === "human" 
                ? "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300" 
                : "bg-neutral-700 text-neutral-200 dark:bg-neutral-700 dark:text-neutral-200"
            )}
          >
            {message.role === "human" ? "U" : "AI"}
          </div>
        </div>
        <div className="flex-1 space-y-2">
          <div className="prose dark:prose-invert max-w-none text-sm whitespace-pre-wrap">
            {message.content}
          </div>
          
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-3">
              <button 
                onClick={() => setShowAttachments(!showAttachments)}
                className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
              >
                <Paperclip className="h-3 w-3" />
                {message.attachments.length} attachment{message.attachments.length !== 1 ? 's' : ''}
              </button>
              
              {showAttachments && (
                <div className="mt-2 grid gap-2 grid-cols-1 sm:grid-cols-2">
                  {message.attachments.map((attachment) => (
                    <a
                      key={attachment.id}
                      href={attachment.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-lg border p-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800"
                    >
                      <Paperclip className="h-4 w-4" />
                      <span className="truncate flex-1">{attachment.fileName}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {isLoading && (
            <div className="flex space-x-1 mt-3">
              <div className="animate-bounce h-2 w-2 bg-neutral-300 rounded-full"></div>
              <div className="animate-bounce h-2 w-2 bg-neutral-300 rounded-full" style={{ animationDelay: "0.2s" }}></div>
              <div className="animate-bounce h-2 w-2 bg-neutral-300 rounded-full" style={{ animationDelay: "0.4s" }}></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}