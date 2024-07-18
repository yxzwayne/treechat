import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

import TopNavbar from "@/components/TopNavbar";

export default async function ProtectedPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  console.log(user);

  if (!user) {
    return redirect("/login");
  }

  return (
    <>
      <TopNavbar />
      <div className="flex flex-col items-center min-h-screen pt-[navbar-height]">
        <h1 className="text-2xl font-bold">Hello, private!</h1>
      </div>
    </>
  );
}