'use client'

import { useState, useEffect } from 'react';
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { User } from '@supabase/supabase-js';

import TopNavbar from "@/components/TopNavbar";
import NewChatBox from "@/components/NewChatBox";

export default function ProtectedPage() {
  const [chats, setChats] = useState([]);
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        console.log("User fetched:", user.id);
      } else {
        console.log("No user found");
      }
    };
    getUser();
  }, []);

  return (
    <>
      <TopNavbar />
      <div className="flex flex-col overflow-auto min-h-screen">
        <NewChatBox />
      </div>
    </>
  );
}