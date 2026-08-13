"use client";

// Journal — coming soon: port of the design's bound-notebook screen
// (docs/design/pitaya-app.dc.html). Tonight's Page keeps living in
// Today until the archive is bound.

const FEATURES = [
  "Photo, voice & text entries",
  "Tags & one search across everything",
  "“On this day” lookbacks",
  "Entries linked to passages",
];

export default function JournalPage() {
  const dateLabel = new Date()
    .toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" })
    .toUpperCase()
    .replace(",", " ·");

  return (
    <div className="stagger-children min-h-screen bg-[#F2F1F2] px-[22px] pb-52 pt-12 lg:px-8">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
            THE ARCHIVE OF YOUR DAYS · {dateLabel}
          </p>
          <h1
            className="mt-0.5 text-[30px] font-bold tracking-[-0.02em] text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Journal
          </h1>
        </div>
        <span className="rounded-full bg-accent px-3 py-[5px] text-xs font-semibold text-[#8C2F51]">
          coming soon
        </span>
      </div>

      <div className="mt-4 rounded-[20px] bg-white px-6 py-8 text-center shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <div className="mx-auto flex h-[68px] w-[68px] items-center justify-center rounded-full bg-accent">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#A63D63" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13.2 6.2 17.8 10.8 8.3 20.3 2.5 21.5 3.7 15.7 13.2 6.2Z" />
            <path d="M13.2 6.2l1.8-1.8a2.05 2.05 0 0 1 2.9 0l1.7 1.7a2.05 2.05 0 0 1 0 2.9l-1.8 1.8" />
            <path d="M10.6 13.4 8.9 15.1" />
          </svg>
        </div>
        <h2
          className="mt-4 text-[19px] font-bold text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          The notebook is being bound.
        </h2>
        <p className="mt-2 text-[13px] leading-[1.65] text-[#66646C]">
          Photos, voice, and text in one archive — tagged, searchable, “on this day,”
          and every entry linkable to the passage you were reading.
        </p>
      </div>

      <div className="mt-3 grid gap-px overflow-hidden rounded-[14px] border border-[#E4E2E6] bg-[#E4E2E6]">
        {FEATURES.map((f) => (
          <div key={f} className="flex items-center justify-between bg-white px-3.5 py-3">
            <span className="text-[12.5px] text-[#454349]">{f}</span>
            <span className="rounded-full bg-[#F2F1F2] px-2 py-[2px] text-[10px] font-semibold text-muted-foreground">
              soon
            </span>
          </div>
        ))}
      </div>

      <p className="mt-3.5 text-center text-[11px] leading-[1.6] text-muted-foreground">
        Until then, Tonight&apos;s Page keeps living in Today —
        <br />
        and prayer, if recorded, lives here as a tag. No verdicts, ever.
      </p>
    </div>
  );
}
