import { Outlet, Link } from "@remix-run/react";
import { useConversation } from "~/lib/contexts/ConversationContext";
import { ConversationSidebar } from "~/components/core/ConversationSidebar";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "~/components/ui/button";

export default function ConversationsLayout() {
  const { conversations, activeConversation } = useConversation();

  // Map backend conversation data to component props
  const conversationItems = conversations.map(conv => ({
    id: conv.uuid,
    title: conv.summary || "New Conversation",
    updatedAt: conv.updated_at
  }));

  return (
    <div className="flex h-screen">
      <div className="flex h-full">
        <ConversationSidebar 
          conversations={conversationItems}
          activeConversationId={activeConversation?.uuid}
        />
      </div>
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-4">
          <h1 className="text-lg font-semibold">
            {activeConversation?.summary || "Treechat"}
          </h1>
          <Button variant="outline" size="sm" asChild>
            <Link to="/new">
              <MessageSquarePlus className="mr-2 h-4 w-4" />
              New Chat
            </Link>
          </Button>
        </header>
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}