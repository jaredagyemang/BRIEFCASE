import { ModeTransition } from "@/components/mode-transition";

export default function EventsLayout({ children }: LayoutProps<"/events">) {
  return <ModeTransition mode="events">{children}</ModeTransition>;
}
