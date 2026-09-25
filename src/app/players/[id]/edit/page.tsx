import { redirectToLatestAppearance } from "@/lib/player-redirect";

export default async function PlayerEditRedirectPage({ params }: PageProps<"/players/[id]/edit">) {
  const { id } = await params;
  return redirectToLatestAppearance(id, "/edit");
}
