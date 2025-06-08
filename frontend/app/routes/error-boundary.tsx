import { Link, useRouteError } from "@remix-run/react";
import { Button } from "~/components/ui/button";

export default function ErrorBoundary() {
  const error = useRouteError();
  
  let errorMessage = "An unexpected error occurred";
  let statusCode = 500;
  
  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === "object" && error !== null) {
    // @ts-ignore - error could be a Response
    statusCode = error.status || 500;
    // @ts-ignore - error could have a data property
    errorMessage = error.data?.message || "An unexpected error occurred";
  }
  
  return (
    <div className="flex h-screen flex-col items-center justify-center p-4 text-center">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold">Error {statusCode}</h1>
        <p className="text-neutral-500 dark:text-neutral-400">{errorMessage}</p>
        <div className="flex justify-center gap-4">
          <Button asChild>
            <Link to="/">Go Home</Link>
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </div>
      </div>
    </div>
  );
}