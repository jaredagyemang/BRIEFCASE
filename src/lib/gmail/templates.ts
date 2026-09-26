import type { DocketInfo, InfoField, ReplyTemplate } from "./docket-types";

// Reply templates for the Info card. The coach reviews and can edit the text
// before it's sent. Only details the email states outright are filled in;
// anything the AI only inferred is left out in favor of general wording.

export const TEMPLATE_LABEL: Record<ReplyTemplate, string> = {
  lets_connect: "Let’s Connect",
  not_interested: "Not interested",
  wrong_position: "Wrong position",
  wrong_grad_year: "Wrong grad year",
};

const stated = (f: InfoField | undefined) =>
  f?.source === "stated" ? f.value : null;

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

// Is the player the one who sent the email? (Their name appears in full in
// the sender's name.)
export function playerIsSender(player: string, senderName: string) {
  const p = words(player);
  const s = new Set(words(senderName));
  return p.length > 0 && p.every((w) => s.has(w));
}

// "Maria Rivera" → "Maria"; "Coach Rivera" → "Coach Rivera" (a title keeps
// the name after it); an address or nothing → "there".
function greetingName(senderName: string) {
  const name = senderName.trim();
  if (!name || name.includes("@")) return "there";
  const [first, second] = name.split(/\s+/);
  if (/^(coach|mr\.?|mrs\.?|ms\.?|dr\.?)$/i.test(first)) return second ? `${first} ${second}` : "there";
  return first;
}

export function buildReply(
  template: ReplyTemplate,
  { info, senderName, coachName }: { info: DocketInfo | null; senderName: string; coachName: string },
) {
  const player = stated(info?.name);
  const same = player ? playerIsSender(player, senderName) : false;
  const position = stated(info?.position);
  const gradYear = stated(info?.grad_year);
  const hi = `Hi ${greetingName(senderName)},`;
  const signoff = `Best,\n${coachName}`;

  // The player's full name the first time they're mentioned, then just their
  // first name ("Maya Johnson" … "Maya"). "you"/"your" when writing to them.
  const first = player?.split(/\s+/)[0] ?? null;
  let named = false;
  const name = () => {
    if (!player) return null;
    const use = named ? first : player;
    named = true;
    return use;
  };
  const them = () => (same || !player ? "you" : name()!);
  const their = () => (same ? "your" : player ? `${name()}’s` : "the player’s");
  const wish = () => (same ? "you" : (name() ?? "your player"));

  let body: string;
  switch (template) {
    case "lets_connect":
      body = `We’d love to connect and tell ${them()} more about our program. Let’s set up a call or Zoom — let us know what works best.`;
      break;
    case "not_interested":
      body = `Thank you for sending ${their()} information and film. After reviewing it, we don’t have a fit in our program at this time. We wish ${wish()} all the best.`;
      break;
    case "wrong_position":
      body = `Thank you for sending ${their()} film. We aren’t recruiting ${position ? `${position}s` : "players at that position"} for this class right now, so we won’t be able to move forward. Best of luck to ${wish()}.`;
      break;
    case "wrong_grad_year":
      body = `Thank you for sending ${their()} film. We’re focused on other graduating classes than ${gradYear ?? "this one"} right now, so we can’t move forward at this time. Best of luck to ${wish()}.`;
      break;
  }
  return `${hi}\n\n${body}\n\n${signoff}`;
}
