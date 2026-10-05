// Photos on their way to the chat: one capture = up to MAX_SHOTS frames,
// compressed in the browser, sent together as ONE message so the model reads
// them as one meal (plate + sides + label + receipt).
//
// WHY SIX. Each frame leaves here at ≤1280 px on its long edge (~150–330 KB
// of JPEG), so six is ≈2 MB of JSON — comfortably inside Vercel's 4.5 MB
// request ceiling, where eight or ten are not once a couple of busy,
// high-detail plates are in the batch. Six is also ≈1¢ of vision input per
// send, and past that the model starts trading attention between frames
// instead of reading each one. A plate, its sides, a label and a receipt fit.
export const MAX_SHOTS = 6;

/** long edge of the frame the model sees */
const FULL_LONG_EDGE = 1280;
/** short edge of the square-cropped preview (74 css px at 3x) */
const THUMB_SHORT_EDGE = 220;
const FULL_QUALITY = 0.8;
const THUMB_QUALITY = 0.5;

/**
 * Total base64 characters one message may carry. Leaves headroom under the
 * 4.5 MB platform limit for the JSON envelope, the thumbs and the note.
 */
export const PAYLOAD_BUDGET_CHARS = 3_400_000;

export interface Shot {
  id: string;
  /** data URL the model receives */
  full: string;
  /** data URL the transcript keeps */
  thumb: string;
}

export interface FitSize {
  width: number;
  height: number;
}

/** Scale (never up) so the long edge is at most `longEdge`. */
export function fitLongEdge(width: number, height: number, longEdge: number): FitSize {
  const long = Math.max(width, height);
  if (!(long > 0)) return { width: 0, height: 0 };
  const k = Math.min(1, longEdge / long);
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/** Scale (never up) so the SHORT edge is at most `shortEdge`. */
export function fitShortEdge(width: number, height: number, shortEdge: number): FitSize {
  const short = Math.min(width, height);
  if (!(short > 0)) return { width: 0, height: 0 };
  const k = Math.min(1, shortEdge / short);
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/** How many more frames fit, given what is already in the tray. */
export function roomFor(current: number, incoming: number, max = MAX_SHOTS) {
  const room = Math.max(0, max - current);
  return { accept: Math.min(room, Math.max(0, incoming)), dropped: Math.max(0, incoming - room) };
}

export function payloadChars(shots: readonly Pick<Shot, "full">[]): number {
  return shots.reduce((sum, s) => sum + s.full.length, 0);
}

function loadImage(file: File): Promise<{ img: HTMLImageElement; release: () => void }> {
  return new Promise((resolve, reject) => {
    // An object URL, not FileReader → data URL: a 12 MP original as base64 is
    // a ~6 MB string held alongside the decoded bitmap, and iOS kills the web
    // process under that kind of pressure — taking the tray with it.
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, release: () => URL.revokeObjectURL(url) });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

function draw(source: CanvasImageSource, size: FitSize): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(source, 0, 0, size.width, size.height);
  return canvas;
}

let shotSeq = 0;

/**
 * One file → one Shot. Decodes the original ONCE (an <img> draw honours EXIF
 * orientation on every browser this app meets), and takes the thumb from the
 * already-downscaled frame rather than decoding the original a second time.
 */
export async function fileToShot(file: File, quality = FULL_QUALITY): Promise<Shot> {
  const { img, release } = await loadImage(file);
  try {
    const fullCanvas = draw(
      img,
      fitLongEdge(img.naturalWidth, img.naturalHeight, FULL_LONG_EDGE)
    );
    const full = fullCanvas.toDataURL("image/jpeg", quality);
    const thumb = draw(
      fullCanvas,
      fitShortEdge(fullCanvas.width, fullCanvas.height, THUMB_SHORT_EDGE)
    ).toDataURL("image/jpeg", THUMB_QUALITY);
    shotSeq += 1;
    return { id: `shot-${Date.now().toString(36)}-${shotSeq}`, full, thumb };
  } finally {
    release();
  }
}

/**
 * Files → Shots, one at a time. In parallel, six 12 MP decodes are ~300 MB of
 * bitmaps at once; in sequence it is one, released before the next begins.
 */
export async function filesToShots(files: readonly File[]): Promise<Shot[]> {
  const shots: Shot[] = [];
  for (const file of files) {
    shots.push(await fileToShot(file));
  }
  return shots;
}

/** Re-encode a data-URL frame at a lower quality (the budget fallback). */
function recompress(dataUrl: string, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        resolve(
          draw(img, { width: img.naturalWidth, height: img.naturalHeight }).toDataURL(
            "image/jpeg",
            quality
          )
        );
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => reject(new Error("Failed to re-encode image"));
    img.src = dataUrl;
  });
}

/**
 * Keep a message under the platform's body limit. Almost never does anything
 * — six ordinary frames land near 1.5 MB — but six dense, high-contrast
 * shots can overshoot, and a 413 from the edge loses the whole send.
 */
export async function fitPayloadBudget(
  shots: readonly Shot[],
  budget = PAYLOAD_BUDGET_CHARS
): Promise<Shot[]> {
  let out = [...shots];
  for (const quality of [0.68, 0.55]) {
    if (payloadChars(out) <= budget) break;
    out = await Promise.all(
      out.map(async (s) => ({ ...s, full: await recompress(s.full, quality) }))
    );
  }
  return out;
}
