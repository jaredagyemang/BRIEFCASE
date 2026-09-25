import { ModeTransition } from "@/components/mode-transition";

export default function DocketLayout({ children }: LayoutProps<"/docket">) {
  return <ModeTransition>{children}</ModeTransition>;
}
