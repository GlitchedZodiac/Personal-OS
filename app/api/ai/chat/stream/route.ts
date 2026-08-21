import { NextRequest } from "next/server";
import { openai, CHAT_MODEL } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import { getUserTimeZone } from "@/lib/server-timezone";
import { getDateStringInTimeZone, getZonedDateParts } from "@/lib/timezone";
import { CHAT_SYSTEM_PROMPT, CHAT_RESPONSES_TOOLS } from "@/lib/ai-prompts";
import {
  executeGetHealthData,
  proposalKindFor,
  sanitizeProposalArgs,
} from "@/lib/chat-tools";
import { normalizeFoodItemsWithTiming } from "@/lib/food-timing";
import { classifyOpenAIError, recordAIUsage } from "@/lib/ai-usage";

// Chat 2b — the Responses-API agentic loop with SSE streaming.
// chat-completions rejects tools+reasoning on GPT-5.6; here they combine.
// Loop contract: read tools (get_health_data) and set_reminder execute
// server-side and feed back; logging/edit/delete tools are PROPOSALS —
// streamed to the client as cards, saved only after the user confirms
// (the confirmation-dock shape, kept per CLAUDE.md).

export const maxDuration = 60;

const MAX_TURNS = 5;
const HISTORY_LIMIT = 20;
const MAX_IMAGES = 6; // one capture's worth — plate, label, receipt…

interface FunctionCallItem {
  type: "function_call";
  id?: string;
  call_id: string;
  name: string;
  arguments: string;
}

function sse(payload: object) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function pad2(v: number) {
  return String(v).padStart(2, "0");
}

function buildDateContext(now: Date, timeZone: string) {
  const parts = getZonedDateParts(now, timeZone);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(now);
  return `\n\n[Now: ${parts.year}-${pad2(parts.month)}-${pad2(parts.day)} ${pad2(parts.hour)}:${pad2(parts.minute)} (${weekday}) · ${timeZone}]`;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  let message = "";
  let source = "text";
  let requestedTimeZone: string | null = null;
  let images: string[] = [];
  let thumbs: string[] = [];
  try {
    const body = await request.json();
    message = typeof body.message === "string" ? body.message.trim() : "";
    source = body.source === "voice" ? "voice" : body.source === "photo" ? "photo" : "text";
    requestedTimeZone = typeof body.timeZone === "string" ? body.timeZone : null;
    // Photo captures: up to MAX_IMAGES data URLs go to the model; the tiny
    // thumbs are what the transcript keeps (full frames would bloat the row).
    if (Array.isArray(body.images)) {
      images = body.images
        .filter((v: unknown): v is string => typeof v === "string" && v.startsWith("data:image/"))
        .slice(0, MAX_IMAGES);
    }
    if (Array.isArray(body.thumbs)) {
      thumbs = body.thumbs
        .filter((v: unknown): v is string => typeof v === "string" && v.startsWith("data:image/"))
        .slice(0, MAX_IMAGES);
    }
  } catch {
    // fall through to the empty-message check
  }
  // A capture with no words is still a message — the photos are the content.
  if (!message && images.length > 0) {
    message =
      images.length === 1
        ? "(photo — log what you see)"
        : `(${images.length} photos — log what you see)`;
  }
  if (!message) {
    return new Response(JSON.stringify({ error: "No message provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const timeZone = await getUserTimeZone(requestedTimeZone);
  const now = new Date();
  const todayStr = getDateStringInTimeZone(now, timeZone);

  // Everything below used to run as four SEQUENTIAL round-trips to the
  // Supabase pooler before the first byte could leave — dead air the user
  // reads as "the chat is slow". Settings and history are independent, so
  // they go together; the user-message insert doesn't gate the model at all,
  // so it starts here and is only awaited before the assistant row is
  // written (which is seconds later, so createdAt ordering still holds).
  const [settingsRow, historyRows] = await Promise.all([
    prisma.userSettings
      .findUnique({ where: { id: "default" }, select: { data: true } })
      .catch(() => null),
    prisma.chatMessage.findMany({
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
    }),
  ]);

  const userRowWrite = prisma.chatMessage
    .create({
      data: {
        role: "user",
        content: message,
        meta: { source, ...(thumbs.length > 0 ? { thumbs } : {}) },
      },
    })
    .catch((error) => {
      console.error("Chat user-message write failed:", error);
      return null;
    });

  // Settings drive reply language (bilingual EN/ES requirement).
  const aiLanguage =
    ((settingsRow?.data as { aiLanguage?: string } | null)?.aiLanguage ?? "english") ===
    "spanish"
      ? "Spanish (Español)"
      : "English";

  const instructions =
    CHAT_SYSTEM_PROMPT.replace(/\{\{RESPONSE_LANGUAGE\}\}/g, aiLanguage) +
    buildDateContext(now, timeZone);

  // Thread history (persisted rolling chat). Proposals compress to one line
  // so the model knows what happened without re-parsing card payloads.
  const history = historyRows.reverse().map((m) => {
    if (m.role === "proposal") {
      const meta = (m.meta ?? {}) as { kind?: string; status?: string };
      return {
        role: "assistant" as const,
        content: `[Proposed ${meta.kind ?? "log"} card — ${meta.status ?? "pending"}] ${m.content}`,
      };
    }
    return {
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    };
  });

  // Responses API multimodal shape: one user item, text part + image parts.
  const userContent =
    images.length > 0
      ? [
          { type: "input_text", text: message },
          ...images.map((url) => ({ type: "input_image", image_url: url })),
        ]
      : message;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: object) => controller.enqueue(encoder.encode(sse(payload)));
      let totalIn = 0;
      let totalOut = 0;

      // First byte immediately: defeats intermediary buffering and lets the
      // client swap its spinner for a live typing indicator before the model
      // has produced anything.
      send({ type: "open" });

      try {
        // Responses API input list — grows with each loop turn.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let input: any[] = [...history, { role: "user", content: userContent }];
        let finalText = "";

        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const response = await openai.responses.create({
            model: CHAT_MODEL,
            instructions,
            input,
            tools: CHAT_RESPONSES_TOOLS as never,
            reasoning: { effort: "low" },
            include: ["reasoning.encrypted_content"],
            store: false,
            stream: true,
            max_output_tokens: 1600,
          });

          let turnText = "";
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let completed: any = null;

          for await (const event of response) {
            if (event.type === "response.output_text.delta") {
              turnText += event.delta;
              send({ type: "delta", text: event.delta });
            } else if (event.type === "response.completed") {
              completed = event.response;
            } else if (event.type === "error") {
              throw new Error(event.message ?? "stream error");
            }
          }

          totalIn += completed?.usage?.input_tokens ?? 0;
          totalOut += completed?.usage?.output_tokens ?? 0;

          const outputItems: FunctionCallItem[] = (completed?.output ?? []).filter(
            (item: { type?: string }) => item.type === "function_call"
          );

          if (turnText) finalText = turnText;

          if (outputItems.length === 0) break; // plain text turn — done

          // Echo the model's output (incl. reasoning items) back into input,
          // then answer every function call — ALL of them, not just [0].
          input = [...input, ...(completed?.output ?? [])];

          let proposalsEmitted = 0;
          for (const call of outputItems) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(call.arguments || "{}");
            } catch {
              args = {};
            }

            const kind = proposalKindFor(call.name);
            if (kind) {
              // Zero-filled measurement fields never reach the card or the DB.
              args = sanitizeProposalArgs(call.name, args);
              if (call.name === "log_food") {
                args = {
                  ...args,
                  items: normalizeFoodItemsWithTiming(
                    args.items as never,
                    message,
                    timeZone,
                    now
                  ),
                };
              }
              // Same ordering guard as the assistant row — a proposal must
              // not land ahead of the message that prompted it.
              await userRowWrite;
              const saved = await prisma.chatMessage.create({
                data: {
                  role: "proposal",
                  content: String(args.message ?? ""),
                  meta: { kind, data: args as object, status: "pending" },
                },
              });
              send({ type: "proposal", id: saved.id, kind, data: args });
              proposalsEmitted++;
              input.push({
                type: "function_call_output",
                call_id: call.call_id,
                output: "Card shown to the user for confirmation.",
              });
              continue;
            }

            if (call.name === "get_health_data") {
              send({ type: "tool", name: call.name, query: args.query ?? "" });
              const result = await executeGetHealthData(
                args as { query?: string; days?: number },
                timeZone,
                todayStr
              );
              input.push({
                type: "function_call_output",
                call_id: call.call_id,
                output: JSON.stringify(result),
              });
              continue;
            }

            if (call.name === "set_reminder") {
              const remindAt = new Date(String(args.remindAt ?? ""));
              if (Number.isFinite(remindAt.getTime())) {
                await prisma.reminder.create({
                  data: {
                    title: String(args.title ?? "Reminder"),
                    body: String(args.title ?? "Reminder"),
                    remindAt,
                    url: "/dashboard",
                  },
                });
                input.push({
                  type: "function_call_output",
                  call_id: call.call_id,
                  output: `Reminder created for ${remindAt.toISOString()}.`,
                });
              } else {
                input.push({
                  type: "function_call_output",
                  call_id: call.call_id,
                  output: "Invalid remindAt datetime — ask the user to clarify the time.",
                });
              }
              continue;
            }

            input.push({
              type: "function_call_output",
              call_id: call.call_id,
              output: "Unknown tool.",
            });
          }

          // Proposals are terminal — cards are on screen; the accompanying
          // bubble (if any) already streamed.
          if (proposalsEmitted > 0) break;
        }

        if (finalText) {
          // The user's row must land first or the thread reloads out of order.
          await userRowWrite;
          await prisma.chatMessage.create({
            data: { role: "assistant", content: finalText },
          });
        }

        recordAIUsage({
          surface: "chat",
          model: CHAT_MODEL,
          inputTokens: totalIn,
          outputTokens: totalOut,
        });

        send({ type: "done" });
      } catch (error) {
        console.error("Chat stream error:", error);
        const { userMessage } = classifyOpenAIError(error);
        send({ type: "error", message: userMessage });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
