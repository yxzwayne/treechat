import { createClient } from "@/utils/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function Index({
  searchParams,
}: {
  searchParams: { message: string };
}) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();

  const signIn = async (formData: FormData) => {
    "use server";

    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return redirect("/?message=Could not authenticate user");
    }

    return redirect("/protected");
  };

  const signUp = async (formData: FormData) => {
    "use server";

    const origin = headers().get("origin");
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const supabase = createClient();

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/auth/callback`,
      },
    });

    if (error) {
      return redirect("/?message=Could not authenticate user");
    }

    return redirect("/?message=Check email to continue sign in process");
  };

  const signOut = async () => {
    "use server";
    const supabase = createClient();
    await supabase.auth.signOut();
    return redirect("/");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <h1 className="text-2xl font-bold mb-4">TreeChat</h1>
      <h2 className="text-lg mb-12">Visually showing forked conversations between you and a chatbot</h2>

      {user ? (
        <div className="text-center">
          <p className="mb-4">Welcome, {user.email}!</p>
          <form action={signOut}>
            <button className="px-4 py-2 text-white bg-red-500 hover:bg-red-700 focus:outline-none focus:shadow-outline">
              Sign Out
            </button>
          </form>
        </div>
      ) : (
        <form className="w-full max-w-sm">
          <input
            className="w-full px-3 py-2 mb-3 text-sm leading-tight text-white bg-gray-700 border border-gray-600 rounded shadow appearance-none focus:outline-none focus:shadow-outline focus:border-blue-500"
            name="email"
            type="email"
            placeholder="Email"
            required
          />
          <input
            className="w-full px-3 py-2 mb-3 text-sm leading-tight text-white bg-gray-700 border border-gray-600 rounded shadow appearance-none focus:outline-none focus:shadow-outline focus:border-blue-500"
            name="password"
            type="password"
            placeholder="Password"
            required
          />
          <div className="flex justify-around my-4 gap-8">
            <button
              formAction={signUp}
              className="px-4 py-2 w-full text-white bg-sky-400 hover:bg-sky-700 focus:outline-none focus:shadow-outline"
              type="submit"
            >
              Sign Up
            </button>
            <button
              formAction={signIn}
              className="px-4 py-2 w-full text-white bg-blue-500 hover:bg-blue-700 focus:outline-none focus:shadow-outline"
              type="submit"
            >
              Log In
            </button>
          </div>
        </form>
      )}

      {searchParams?.message && (
        <p className="mt-4 p-4 bg-foreground/10 text-foreground text-center">
          {searchParams.message}
        </p>
      )}

      <p className="mt-8">
        I'm looking for a full-time job in software/AI engineering right now!
        <br />
        Check my <Link className="text-blue-500" href="https://gaiaprime.yxzwayne.com">blog</Link> and <Link className="text-blue-500" href="https://drive.google.com/file/d/1ubkern5lUZaZNnMPbUY2CyAcLlDvz0Mn/view?usp=sharing">resume</Link> for details and shoot me an email any time!
      </p>
    </div>
  );
}