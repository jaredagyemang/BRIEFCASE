import { PageScroller } from "@/components/page-scroller";

export default function DocketLayout({ children }: LayoutProps<"/docket">) {
  return <PageScroller>{children}</PageScroller>;
}
