import { Launch, type RootPageProps, Scripts } from "@huuma/ui/server";

export default function Root({
  children,
  scripts,
  islands,
  transferState,
}: RootPageProps<unknown>) {
  return (
    <html lang="en">
      <head>
        <title>Fixture</title>
        <Scripts scripts={scripts?.head} nonce={scripts?.nonce} />
      </head>
      <body>
        {children}
        <Launch
          body={scripts?.body}
          islands={islands}
          transferState={transferState}
          nonce={scripts?.nonce}
        />
      </body>
    </html>
  );
}
