// Call / Text / Email shortcuts that open the phone's dialer, messages, or
// mail app. Buttons only appear for details that are filled in.
export function ContactActions({ phone, email }: { phone?: string | null; email?: string | null }) {
  const actions = [
    phone && { href: `tel:${phone}`, label: "Call", icon: "📞" },
    phone && { href: `sms:${phone}`, label: "Text", icon: "💬" },
    email && { href: `mailto:${email}`, label: "Email", icon: "✉️" },
  ].filter((a): a is { href: string; label: string; icon: string } => Boolean(a));

  if (actions.length === 0) return null;

  return (
    <div className="mt-6 flex justify-center gap-3">
      {actions.map((a) => (
        <a
          key={a.label}
          href={a.href}
          className="flex w-20 flex-col items-center gap-1 rounded-2xl bg-surface py-3 text-xs font-medium text-accent"
        >
          <span className="text-xl">{a.icon}</span>
          {a.label}
        </a>
      ))}
    </div>
  );
}
