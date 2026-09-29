// Plain legal text as paragraphs, "## " headings and "- " bullet points (see
// src/content/legal.ts).
export function LegalText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {blocks.map((block, i) => {
        const lines = block.split("\n").map((l) => l.trim());
        if (lines[0].startsWith("## ")) {
          return (
            <div key={i} className="space-y-3">
              <h3 className="pt-2 font-semibold">{lines[0].slice(3)}</h3>
              {lines.length > 1 && <LegalText text={lines.slice(1).join("\n")} />}
            </div>
          );
        }
        if (lines.every((l) => l.startsWith("- "))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{l.slice(2)}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{lines.join(" ")}</p>;
      })}
    </div>
  );
}
