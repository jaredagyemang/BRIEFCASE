import { ConnectedWindow } from "./connected-window";

// The end of Connect Gmail / Outlook in the installed iPhone or iPad app's
// sign-in window: passes the result to the app and closes (see
// components/connect-mail-link.tsx).
export default async function ConnectedPage({ searchParams }: PageProps<"/connected">) {
  const params = await searchParams;
  const provider = params.provider === "outlook" ? "outlook" : "gmail";
  const result = typeof params.result === "string" && /^[a-z-]+$/.test(params.result) ? params.result : "failed";
  return <ConnectedWindow provider={provider} result={result} />;
}
