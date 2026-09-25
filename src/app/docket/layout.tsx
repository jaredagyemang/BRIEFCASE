import { ModeTransition } from "@/components/mode-transition";

export default function DocketLayout({ children }: LayoutProps<"/docket">) {
  return <ModeTransition mode="docket">{children}</ModeTransition>;
}
