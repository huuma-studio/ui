// The app's env types; the repo's type check doesn't include `vite/client`.
const env = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env;

// An island outside the routes directory: islands are found project-wide.
export default function Greeting({ name }: { name: string }) {
  return (
    <p>
      {env.PUBLIC_GREETING} {name}
    </p>
  );
}
