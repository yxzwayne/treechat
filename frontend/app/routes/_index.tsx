import type { MetaFunction } from "@remix-run/node";
import { Link } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import { MessageSquarePlus } from "lucide-react";

export const meta: MetaFunction = () => {
  return [
    { title: "Treechat - AI Chat with Tree-Structured Conversations" },
    { name: "description", content: "Explore conversation trees with AI. Branch your chat at any point to explore different directions." },
  ];
};

export default function Index() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <h1 className="text-2xl font-bold">Treechat</h1>
          <nav className="flex gap-4">
            <Link to="/conversations">Conversations</Link>
            <Button asChild>
              <Link to="/new">
                <MessageSquarePlus className="mr-2 h-4 w-4" />
                New Chat
              </Link>
            </Button>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <div className="container flex flex-col items-center justify-center space-y-8 py-20 text-center">
          <div className="space-y-4">
            <h2 className="text-4xl font-bold">Welcome to Treechat</h2>
            <p className="mx-auto max-w-[600px] text-neutral-500 dark:text-neutral-400">
              Explore conversation trees with AI. Branch your chat at any point to 
              explore different directions.
            </p>
          </div>
          <div className="flex gap-4">
            <Button asChild size="lg">
              <Link to="/new">
                <MessageSquarePlus className="mr-2 h-5 w-5" />
                Start a New Conversation
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link to="/conversations">
                View Conversations
              </Link>
            </Button>
          </div>
        </div>
      </main>
      <footer className="border-t py-6">
        <div className="container flex justify-between">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            © {new Date().getFullYear()} Treechat
          </p>
        </div>
      </footer>
    </div>
  );
