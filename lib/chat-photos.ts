// What the model is handed when a message carries photos. Pure, so the one
// property that matters here can be tested: however many frames were taken,
// they travel in ONE user turn of ONE request — never a call per photo — and
// the model is told they belong together.

import { MAX_SHOTS } from "@/lib/photo-capture";

export const MAX_CHAT_IMAGES = MAX_SHOTS;

/** The stored (and displayed) stand-in for a capture sent with no words. */
export function photoPlaceholder(count: number): string {
  return count === 1 ? "(photo — log what you see)" : `(${count} photos — log what you see)`;
}

/**
 * Model-facing note for a multi-photo message. Kept OUT of the stored
 * message so the transcript shows what he said, not our stage directions.
 * His own words still win ("these are two different meals"): the prompt's
 * rule is that photos are evidence and the words are the instruction.
 */
export function oneMealNote(count: number): string {
  return (
    `[${count} photos, sent together as one message. Read all ${count} as ONE meal — ` +
    `a single log_food card listing every item across them — unless they are plainly ` +
    `separate things (a nutrition label or receipt beside a plate, or different meals), ` +
    `or the words above say otherwise.]`
  );
}

export type ChatUserContent =
  | string
  | Array<{ type: "input_text"; text: string } | { type: "input_image"; image_url: string }>;

/** Responses-API content for the user turn: the text, then every image. */
export function buildChatUserContent(
  message: string,
  images: readonly string[]
): ChatUserContent {
  if (images.length === 0) return message;
  const text = images.length > 1 ? `${message}\n\n${oneMealNote(images.length)}` : message;
  return [
    { type: "input_text", text },
    ...images.map((url) => ({ type: "input_image" as const, image_url: url })),
  ];
}

/** Accept only data-URL images, and only as many as one capture allows. */
export function sanitizeImages(value: unknown, max = MAX_CHAT_IMAGES): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.startsWith("data:image/"))
    .slice(0, max);
}
