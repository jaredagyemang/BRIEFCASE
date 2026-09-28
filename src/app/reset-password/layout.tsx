import { PageScroller } from "@/components/page-scroller";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageScroller>{children}</PageScroller>;
}
