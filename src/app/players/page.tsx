import { redirect } from "next/navigation";

// Players now live inside events.
export default function PlayersPage() {
  redirect("/events");
}
