import { PageScroller } from "@/components/page-scroller";

export default function ProfileLayout({ children }: LayoutProps<"/profile">) {
  return <PageScroller>{children}</PageScroller>;
}
