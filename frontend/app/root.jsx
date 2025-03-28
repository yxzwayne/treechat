import { Link, Links, Meta, Outlet, Scripts } from "@remix-run/react";

export default function App() {
  return (
    <html>
      <head>
        <link rel="icon" href="data:image/x-icon;base64,AA" />
        <Meta />
        <Links />
      </head>
      <body>
        <h1>Hello, Oak!</h1>
        <nav>
          <Link to="/conversations">Conversations</Link>
        </nav>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
