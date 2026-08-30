// iPad desk preferences — the shape behind docs/design/pitaya-ipad-11-settings.dc.html.
// User-level prefs persist in SpiritPref.desk (server); per-device bits
// (last layout/tool per context) mirror to localStorage so the desk
// resumes instantly before the network answers.

export type Handedness = "left" | "right";
/** RETIRED 2026-08-30 (his call): study vs scratch merged into one mode — ink always
 * keeps, chip gestures still act. The stored prefs key is simply ignored on read. */
export type OverlayVisibility = "show" | "dim" | "hide";
export type MarginStep = 0 | 1 | 2; // none · wide · wider
export type ActionBarStyle = "A" | "B"; // pen-positioned · fixed upper-right
export type DeskContext = "study" | "sermon" | "free";
export type Retention = "90d" | "forever" | "after_transcript";

export interface PenDefaults {
  tool: "fountain" | "gpen" | "pencil" | "marker" | "highlighter" | "eraser" | "lasso" | "hand";
  brush: "fountain" | "gpen" | "pencil" | "marker";
  color: string;
  widthStep: 0 | 1 | 2;
  /** continuous width multiplier over the brush base (0.5–2.2); the three presets map onto it */
  widthMul: number;
  opacity: number;
  streamline: number; // 0..1
  recents: string[];
}

export interface SavedPalette {
  id: string;
  name: string;
  colors: string[];
}

export interface DeskPrefs {
  handedness: Handedness;
  overlay: { margin: MarginStep; visibility: OverlayVisibility; defaultLayer: "my" | "context" };
  actionBar: ActionBarStyle;
  pen: PenDefaults;
  palettes: SavedPalette[];
  recording: { consent: boolean; retention: Retention; consentShownAt?: string | null };
  sermon: { church: string; preacher: string };
  layouts: Record<DeskContext, DeskLayoutPrefs>;
}

/** A desk tab = one arrangement of panes (Logos-style). `cols` puts the text docs side by side instead of stacked. */
export interface DeskTab {
  id: string;
  label: string;
  writing: string[]; // DocKind[] — the writing column (usually ["notebook"]) or []
  text: string[]; // DocKind[] — the text column, 1–2 docs (stacked unless cols)
  cols?: boolean;
  // A tab is an arrangement AND a place. These were only ever declared on the shell's own
  // richer DeskTab, so the stored type quietly disagreed with what actually round-trips
  // through this file. Nothing was being stripped — the merge is shallow at the context
  // level — but the two types should say the same thing.
  mainQ?: string | null;
  refQ?: string | null;
  verse?: number | null;
  scrollY?: number;
}
export interface DeskLayoutPrefs {
  preset: string;
  nbFrac: number;
  stackFrac: number;
  tabs?: DeskTab[];
  activeTab?: string;
}

export const SKETCH_PURPLES: SavedPalette = {
  id: "sketch-purples",
  name: "Sketch purples",
  colors: ["#3E3357", "#5F4B8B", "#8A76B8", "#B85C8A", "#D9A9C4"],
};
export const SUNDAY_INK: SavedPalette = {
  id: "sunday-ink",
  name: "Sunday ink",
  colors: ["#5F4B8B", "#5E7FA6", "#B85C8A", "#44414B"],
};

export const INK_NAMES: Record<string, string> = {
  "#5F4B8B": "Plum ink",
  "#B85C8A": "Orchid",
  "#5E7FA6": "Slate blue",
  "#44414B": "Graphite",
  "#C99A3B": "Ochre",
  "#3E3357": "Deep violet",
  "#8A76B8": "Lavender",
  "#D9A9C4": "Rose",
};

export const DEFAULT_DESK_PREFS: DeskPrefs = {
  handedness: "left",
  // no margin unless he asks for one (or margin ink exists and the layer is shown) — "no random whitespace"
  overlay: { margin: 0, visibility: "show", defaultLayer: "my" },
  actionBar: "A",
  pen: {
    tool: "fountain",
    brush: "fountain",
    color: "#5F4B8B",
    widthStep: 1,
    widthMul: 1,
    opacity: 1,
    streamline: 0.35,
    recents: ["#5F4B8B", "#B85C8A", "#5E7FA6", "#44414B", "#C99A3B", "#3E3357"],
  },
  palettes: [SKETCH_PURPLES, SUNDAY_INK],
  recording: { consent: true, retention: "forever", consentShownAt: null },
  sermon: { church: "", preacher: "" },
  layouts: {
    study: { preset: "study", nbFrac: 0.535, stackFrac: 0.6 },
    sermon: { preset: "sermon", nbFrac: 0.535, stackFrac: 0.6 },
    free: { preset: "free", nbFrac: 0.535, stackFrac: 0.6 },
  },
};

export function mergeDeskPrefs(partial: unknown): DeskPrefs {
  const p = (partial && typeof partial === "object" ? partial : {}) as Partial<DeskPrefs>;
  return {
    ...DEFAULT_DESK_PREFS,
    ...p,
    overlay: { ...DEFAULT_DESK_PREFS.overlay, ...(p.overlay ?? {}) },
    pen: { ...DEFAULT_DESK_PREFS.pen, ...(p.pen ?? {}) },
    palettes: Array.isArray(p.palettes) && p.palettes.length ? p.palettes : DEFAULT_DESK_PREFS.palettes,
    recording: { ...DEFAULT_DESK_PREFS.recording, ...(p.recording ?? {}) },
    sermon: { ...DEFAULT_DESK_PREFS.sermon, ...(p.sermon ?? {}) },
    layouts: { ...DEFAULT_DESK_PREFS.layouts, ...(p.layouts ?? {}) },
  };
}

export const DESK_PREFS_KEY = "spirit-desk-prefs";

export function readLocalDeskPrefs(): DeskPrefs {
  if (typeof localStorage === "undefined") return DEFAULT_DESK_PREFS;
  try {
    const raw = localStorage.getItem(DESK_PREFS_KEY);
    return mergeDeskPrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_DESK_PREFS;
  }
}

export function writeLocalDeskPrefs(prefs: DeskPrefs) {
  try {
    localStorage.setItem(DESK_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // storage blocked — the session still works
  }
}

/** Seam snap stops, as fractions of the desk — the design's ⅓ · ½ · ⅔ (01). */
export const SEAM_STOPS_V = [0.4, 0.535, 0.66] as const;
export const SEAM_STOPS_H = [0.42, 0.6, 0.74] as const;

export function nearestStop(f: number, stops: readonly number[]): number {
  return stops.reduce((a, b) => (Math.abs(b - f) < Math.abs(a - f) ? b : a));
}
