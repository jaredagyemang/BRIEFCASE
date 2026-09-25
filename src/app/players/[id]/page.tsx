import { redirectToLatestAppearance } from "@/lib/player-redirect";

export default async function PlayerRedirectPage({ params }: PageProps<"/players/[id]">) {
  const { id } = await params;
  return redirectToLatestAppearance(id);
}
