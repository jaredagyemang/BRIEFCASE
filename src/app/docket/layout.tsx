// The Docket's screen fills the space between the header and the bottom of
// the screen. Unlike the other modes it isn't one scrolling page: when Gmail
// is connected it's a full-screen video feed that scrolls card by card.
export default function DocketLayout({ children }: LayoutProps<"/docket">) {
  return <div className="relative h-full">{children}</div>;
}
