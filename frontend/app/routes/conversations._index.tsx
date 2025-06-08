import { Link } from "@remix-run/react";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "~/components/ui/button";

export default function ConversationsIndex() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-4 text-center">
      <div className="mx-auto max-w-lg space-y-4">
        <h2 className="text-2xl font-bold">No Conversation Selected</h2>
        <p className="text-neutral-500 dark:text-neutral-400">
          Select a conversation from the sidebar or start a new one to begin.
        </p>
        <Button asChild>
          <Link to="/new">
            <MessageSquarePlus className="mr-2 h-4 w-4" />
            Start a New Conversation
          </Link>
        </Button>
      </div>
    </div>
  );
}