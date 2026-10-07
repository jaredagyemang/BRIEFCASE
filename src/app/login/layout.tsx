import { PageScroller } from "@/components/page-scroller";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageScroller signedOut>{children}</PageScroller>;
}
