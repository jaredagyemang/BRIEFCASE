import { ModeTransition } from "@/components/mode-transition";

export default function ProfileLayout({ children }: LayoutProps<"/profile">) {
  return <ModeTransition>{children}</ModeTransition>;
}
