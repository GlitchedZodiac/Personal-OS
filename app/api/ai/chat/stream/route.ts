import { NextRequest } from "next/server";
import { openai, CHAT_MODEL } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import { getUserTimeZone } from "@/lib/server-timezone";
import { getDateStringInTimeZone, getZonedDateParts } from "@/lib/timezone";
import { CHAT_SYSTEM_PROMPT, CHAT_RESPONSES_TOOLS } from "@/lib/ai-prompts";
import { createConversation, touchConversation, writeAiTitle } from "@/lib/chat-conversations";
import { buildChatUserContent, photoPlaceholder, sanitizeImages } from "@/lib/chat-photos";
import { proposalKindFor, sanitizeProposalArgs } from "@/lib/chat-tools";
import { type AppDataArgs, executeAppData } from "@/lib/ai/data-access";
import { normalizeFoodItemsWithTiming } from "@/lib/food-timing";
import { matchUsual } from "@/lib/food-match";
import { classifyOpenAIError, recordAIUsage } from "@/lib/ai-usage";

// Chat 2b — the Responses-API agentic loop with SSE streaming.
// chat-completions rejects tools+reasoning on GPT-5.6; here they combine.
// Loop contract: read tools (get_health_data) and set_reminder execute
// server-side and feed back; logging/edit/delete tools are PROPOSALS —
// streamed to the client as cards, saved only after the user confirms
// (the confirmation-dock shape, kept per CLAUDE.md).
//
// CONVERSATIONS (2026-10-04). A turn belongs to one chat. The transcript the
// model is shown is THAT chat only — so "New chat" really is a clean slate —
// but nothing about its access to his data lives in the transcript: the
// instructions, the date context and the get_app_data tool are attached to
// every turn regardless. A brand-new chat can read his logs, measurements,
// workouts and plans exactly as a long one can; it simply has no earlier
// small talk to lean on, and is told so.

export const maxDuration = 60;

// 6, not 5: a cross-domain question ("how did my spending track against my
// training") can need a second read round after seeing the first. Costs
// nothing when unused. The wall-clock guard below is the real backstop.
const MAX_TURNS = 6;

// maxDuration is 60s. Without a check, a slow multi-dataset turn can hit the
// Vercel ceiling mid-stream and the user gets NOTHING. Bail at 42s and spend
// the remainder on one final text turn.
const SOFT_DEADLINE_MS = 42_000;
// 12, down from 20 (2026-08-29): chat input averaged 7.1k tokens/call and
// the replayed history was a big slice of it — a food log doesn't need last
// week's conversation. Proposals are already compressed to one line each.
const HISTORY_LIMIT = 12;

// The first turn of a chat: the model can no longer see yesterday's
// conversation, and must not paper over that by guessing or by asking him to
// repeat what his own log already holds.
const NEW_CHAT_NOTE =
  "\n\n[This is the first message of a NEW chat. Earlier chats are not in view. " +
  "Everything he has logged is — food, measurements, workouts, routines, plans. " +
  "If the message leans on something from before (\"same as yesterday\", \"that " +
  "trail run\"), read it with get_app_data rather than assuming or asking him to say it again.]";

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
  let requestedConversationId: string | null = null;
  try {
    const body = await request.json();
    message = typeof body.message === "string" ? body.message.trim() : "";
    source = body.source === "voice" ? "voice" : body.source === "photo" ? "photo" : "text";
    requestedTimeZone = typeof body.timeZone === "string" ? body.timeZone : null;
    requestedConversationId =
      typeof body.conversationId === "string" && body.conversationId ? body.conversationId : null;
    // Photo captures: one capture's worth of data URLs go to the model; the
    // tiny thumbs are what the transcript keeps (full frames would bloat the
    // row). Limits and shape: lib/chat-photos.ts.
    images = sanitizeImages(body.images);
    thumbs = sanitizeImages(body.thumbs);
  } catch {
    // fall through to the empty-message check
  }
  // A capture with no words is still a message — the photos are the content.
  if (!message && images.length > 0) message = photoPlaceholder(images.length);
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
  const [settingsRow, existingConversation, priorRows] = await Promise.all([
    prisma.userSettings
      .findUnique({ where: { id: "default" }, select: { data: true } })
      .catch(() => null),
    requestedConversationId
      ? prisma.chatConversation
          .findUnique({
            where: { id: requestedConversationId },
            select: { id: true, title: true, titleSource: true },
          })
          .catch(() => null)
      : Promise.resolve(null),
    // History is THIS chat's, never the whole table's.
    requestedConversationId
      ? prisma.chatMessage.findMany({
          where: { conversationId: requestedConversationId },
          orderBy: { createdAt: "desc" },
          take: HISTORY_LIMIT,
        })
      : Promise.resolve([]),
  ]);

  // A known chat continues. No id (he tapped "New chat", or the quiet-gap
  // rule on the client started one) or an id that is gone → a new chat,
  // named from these first words until the first exchange can name it better.
  const startedNew = !existingConversation;
  const conversation =
    existingConversation ?? (await createConversation({ firstUserText: message, at: now, timeZone }));
  const historyRows = startedNew ? [] : priorRows;

  const userRowWrite = prisma.chatMessage
    .create({
      data: {
        role: "user",
        content: message,
        conversationId: conversation.id,
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
    buildDateContext(now, timeZone) +
    (historyRows.length === 0 ? NEW_CHAT_NOTE : "");

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

  // Responses API multimodal shape: ONE user item — the text, then every
  // photo of the capture — so several frames are read together as one meal.
  const userContent = buildChatUserContent(message, images);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: object) => controller.enqueue(encoder.encode(sse(payload)));
      let totalIn = 0;
      let totalOut = 0;

      // First byte immediately: defeats intermediary buffering and lets the
      // client swap its spinner for a live typing indicator before the model
      // has produced anything.
      send({ type: "open" });
      // The client may have sent no id; it needs to know which chat this is
      // before the next message.
      send({
        type: "conversation",
        id: conversation.id,
        title: conversation.title,
        titleSource: conversation.titleSource,
        created: startedNew,
      });

      try {
        // Responses API input list — grows with each loop turn.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let input: any[] = [...history, { role: "user", content: userContent }];
        let finalText = "";

        const startedAt = Date.now();

        for (let turn = 0; turn < MAX_TURNS; turn++) {
          // Out of time: stop reading, force one final text turn so he gets an
          // answer (or an honest "ask me more narrowly") instead of silence.
          const outOfTime =
            turn > 0 && Date.now() - startedAt > SOFT_DEADLINE_MS;
          if (outOfTime) {
            input.push({
              role: "system",
              content:
                "You are out of time. Answer NOW from what you already retrieved. Do not call any more tools. If you did not get enough, say so in one line and suggest a narrower question.",
            });
          }

          const response = await openai.responses.create({
            model: CHAT_MODEL,
            instructions,
            input,
            tools: outOfTime ? [] : (CHAT_RESPONSES_TOOLS as never),
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
                const items = normalizeFoodItemsWithTiming(
                  args.items as never,
                  message,
                  timeZone,
                  now
                );
                // v4 (token ROI): fuzzy-match each item against saved usuals
                // so the card can offer the zero-token path. Deterministic,
                // one small query, never blocks the proposal.
                let annotated = items as Array<Record<string, unknown>>;
                try {
                  const usuals = await prisma.favoriteFoods.findMany({
                    select: {
                      id: true,
                      foodDescription: true,
                      mealType: true,
                      calories: true,
                      proteinG: true,
                      carbsG: true,
                      fatG: true,
                      kind: true,
                      servingLabel: true,
                    },
                    take: 40,
                  });
                  if (usuals.length > 0) {
                    annotated = (items as Array<Record<string, unknown>>).map((it) => {
                      const desc = String(it.foodDescription ?? "");
                      const match = desc ? matchUsual(desc, usuals) : null;
                      if (!match) return it;
                      const full = usuals.find((u) => u.id === match.id);
                      return full ? { ...it, usual: full } : it;
                    });
                  }
                } catch {
                  // favorites unavailable — the card just shows no shortcut
                }
                args = { ...args, items: annotated };
              }
              // Same ordering guard as the assistant row — a proposal must
              // not land ahead of the message that prompted it.
              await userRowWrite;
              const saved = await prisma.chatMessage.create({
                data: {
                  role: "proposal",
                  content: String(args.message ?? ""),
                  conversationId: conversation.id,
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

            // `get_health_data` is still accepted so a turn already in flight
            // against the previous deploy cannot break mid-stream.
            if (call.name === "get_app_data" || call.name === "get_health_data") {
              const dataset = String(args.dataset ?? args.query ?? "");
              send({ type: "tool", name: "get_app_data", query: dataset });
              const result = await executeAppData(
                { ...(args as AppDataArgs), dataset },
                { timeZone, todayStr }
              );
              input.push({
                type: "function_call_output",
                call_id: call.call_id,
                output: JSON.stringify(result),
              });
              continue;
            }

            // (set_reminder's inline write was removed 2026-08-29 — it now
            // rides proposalKindFor like every other write: card → confirm
            // → POST /api/reminders.)

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
            data: { role: "assistant", content: finalText, conversationId: conversation.id },
          });
        }
        await userRowWrite;
        await touchConversation(conversation.id);

        recordAIUsage({
          surface: "chat",
          model: CHAT_MODEL,
          inputTokens: totalIn,
          outputTokens: totalOut,
        });

        send({ type: "done" });

        // Name a new chat from its first exchange. AFTER "done": the reply
        // is already complete on his screen, so this costs him nothing —
        // the client frees the composer on "done" and picks the title up
        // when it lands.
        if (startedNew) {
          const title = await writeAiTitle(conversation.id);
          if (title) send({ type: "title", id: conversation.id, title });
        }
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
