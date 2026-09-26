import { buildXlsx, type Cell, type Column } from "@/lib/xlsx";

// Notes as a spreadsheet, for coaches who keep a reference file outside the
// app. Two versions share the same first columns:
// - a batch of scanned handwritten notes (with the page and how each note was
//   matched to its player), from the scan review screen;
// - every note from an event (typed, voice and handwritten), from the event.

export type ExportPlayer = {
  name: string;
  jersey: string | null;
  position: string | null;
  grad_year: number | null;
  club: string | null;
  email: string | null;
  gpa: string | null;
};

const PLAYER_COLUMNS: Column[] = [
  { header: "Player", width: 24 },
  { header: "Jersey #", width: 9 },
  { header: "Position", width: 12 },
  { header: "Grad year", width: 10 },
  { header: "Club", width: 22 },
  { header: "Email", width: 28 },
  { header: "GPA", width: 9 },
  { header: "Event", width: 28 },
  { header: "Note", width: 70, wrap: true },
];

const playerCells = (p: ExportPlayer | null, eventName: string, note: string): Cell[] =>
  p
    ? [p.name, p.jersey, p.position, p.grad_year, p.club, p.email, p.gpa, eventName, note]
    : ["(Unassigned)", null, null, null, null, null, null, eventName, note];

export function scanBatchXlsx(
  eventName: string,
  notes: { player: ExportPlayer | null; text: string; page: number; matched: string }[],
) {
  return buildXlsx(
    "Scanned notes",
    [...PLAYER_COLUMNS, { header: "Page #", width: 8 }, { header: "Matched", width: 20 }],
    notes.map((n) => [...playerCells(n.player, eventName, n.text), n.page, n.matched]),
  );
}

export function eventNotesXlsx(
  eventName: string,
  notes: { player: ExportPlayer; text: string; type: string; by: string; date: string }[],
) {
  return buildXlsx(
    "Notes",
    [...PLAYER_COLUMNS, { header: "Type", width: 12 }, { header: "By", width: 20 }, { header: "Date", width: 17 }],
    notes.map((n) => [...playerCells(n.player, eventName, n.text), n.type, n.by, n.date]),
  );
}

// "ECNL Ohio — June 2026 (Day 1)" → "ECNL Ohio - June 2026 (Day 1) notes.xlsx".
// Plain characters only: some browsers drop a download name with others.
export function exportFileName(eventName: string, suffix: string) {
  const base = eventName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[‐-―]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7e]+/g, " ")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${base || "Event"} ${suffix}.xlsx`;
}

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
