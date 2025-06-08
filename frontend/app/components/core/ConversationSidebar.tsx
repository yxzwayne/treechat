import { useState } from "react";
import { Link } from "@remix-run/react";
import { Plus, MessageSquare } from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeConversationId?: string;
}

export function ConversationSidebar({
  conversations,
  activeConversationId,
}: ConversationSidebarProps) {
  return (
    <div className="flex h-full w-64 flex-col border-r">
      <div className="flex items-center justify-between p-4">
        <h2 className="text-lg font-semibold">Conversations</h2>
        <Button variant="outline" size="icon" asChild>
          <Link to="/new" aria-label="New conversation">
            <Plus className="h-4 w-4" />
          </Link>
        </Button>
      </div>
      <div className="flex-1 overflow-auto py-2">
        <nav className="grid gap-1 px-2">
          {conversations.map((conversation) => (
            <Link
              key={conversation.id}
              to={`/conversations/${conversation.id}`}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                activeConversationId === conversation.id
                  ? "bg-neutral-100 font-medium dark:bg-neutral-800"
                  : "hover:bg-neutral-50 dark:hover:bg-neutral-900"
              )}
            >
              <MessageSquare className="h-4 w-4" />
              <div className="flex-1 truncate">{conversation.title}</div>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}