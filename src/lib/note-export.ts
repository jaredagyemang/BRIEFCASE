import { buildWorkbook, buildXlsx, type Cell, type Column } from "@/lib/xlsx";

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
    : ["(No player yet)", null, null, null, null, null, null, eventName, note];

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
  notes: { player: ExportPlayer | null; text: string; type: string; by: string; date: string }[],
) {
  return buildXlsx(
    "Notes",
    [...PLAYER_COLUMNS, { header: "Type", width: 12 }, { header: "By", width: 20 }, { header: "Date", width: 17 }],
    notes.map((n) => [...playerCells(n.player, eventName, n.text), n.type, n.by, n.date]),
  );
}

// Text safe for a file name everywhere: plain characters only (some
// browsers drop a download name with others), e.g. "—" → "-", "é" → "e".
function plainName(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[‐-―]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7e]+/g, " ")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

// "ECNL Ohio — June 2026 (Day 1)" → "ECNL Ohio - June 2026 (Day 1) notes.xlsx".
export function exportFileName(eventName: string, suffix: string) {
  return `${plainName(eventName) || "Event"} ${suffix}.xlsx`;
}

// "Maya Johnson - ECNL Ohio - June 2026 (Day 1).xlsx"
export function playerFileName(playerName: string, eventName: string) {
  return `${plainName(playerName) || "Player"} - ${plainName(eventName) || "Event"}.xlsx`;
}

// The coach's time zone from ?tz=, so dates match their clock.
export function validTimeZone(tz: string | null) {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

// ---- One player

export type PlayerDetails = {
  name: string;
  jersey: string | null;
  position: string | null;
  grad_year: number | null;
  club: string | null;
  email: string | null;
  phone: string | null;
  gpa: string | null;
  status: string;
};

// One event the player was seen at: their rating there, and every rating
// and note (in time order).
export type PlayerEventHistory = {
  name: string;
  date: string;
  jersey: string | null;
  rating: string | null;
  entries: { date: string; type: string; by: string; rating: string | null; note: string | null }[];
};

// Sheets: "Player" (details), "Notes" (every rating and note, newest event
// first) and, with other events included, "Events" (a rating per event).
export function playerXlsx(player: PlayerDetails, events: PlayerEventHistory[], exportedAt: string) {
  const [thisEvent, ...others] = events;
  const details: Cell[][] = [
    ["Name", player.name],
    ["Jersey #", player.jersey],
    ["Position", player.position],
    ["Grad year", player.grad_year],
    ["Club", player.club],
    ["Email", player.email],
    ["Phone", player.phone],
    ["GPA", player.gpa],
    ["Status", player.status],
    ["Event", thisEvent.name],
    ["Rating at this event", thisEvent.rating ?? "Not rated"],
    ...(others.length ? [["Also seen at", others.map((e) => e.name).join(", ")] as Cell[]] : []),
    ["Exported", exportedAt],
  ];
  const noteRows = events.flatMap((e) => e.entries.map((n) => [e.name, e.date, n.date, n.type, n.by, n.rating, n.note]));
  return buildWorkbook([
    {
      name: "Player",
      columns: [
        { header: "Field", width: 22, bold: true },
        { header: "Value", width: 50, wrap: true },
      ],
      rows: details,
      filter: false,
    },
    {
      name: "Notes",
      columns: [
        { header: "Event", width: 28 },
        { header: "Event date", width: 13 },
        { header: "Date", width: 20 },
        { header: "Type", width: 12 },
        { header: "By", width: 20 },
        { header: "Rating", width: 9 },
        { header: "Note", width: 70, wrap: true },
      ],
      rows: noteRows,
    },
    ...(others.length
      ? [
          {
            name: "Events",
            columns: [
              { header: "Event", width: 28 },
              { header: "Event date", width: 13 },
              { header: "Jersey #", width: 9 },
              { header: "Rating", width: 11 },
              { header: "Notes", width: 8 },
            ],
            rows: events.map((e) => [
              e.name,
              e.date,
              e.jersey,
              e.rating ?? "Not rated",
              e.entries.filter((n) => n.note !== null).length,
            ]),
          },
        ]
      : []),
  ]);
}

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
