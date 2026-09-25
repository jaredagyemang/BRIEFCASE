import { PageScroller } from "@/components/page-scroller";

export default function EventsLayout({ children }: LayoutProps<"/events">) {
  return <PageScroller>{children}</PageScroller>;
}
