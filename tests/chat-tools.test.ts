import { describe, expect, it } from "vitest";
import {
  PROPOSAL_TOOL_NAMES,
  proposalKindFor,
  sanitizeMeasurementArgs,
  sanitizeProposalArgs,
} from "@/lib/chat-tools";
import { CHAT_RESPONSES_TOOLS, CHAT_SYSTEM_PROMPT } from "@/lib/ai-prompts";

describe("chat 2b tool surface", () => {
  it("exposes flat Responses-API tool shapes (name at top level)", () => {
    for (const tool of CHAT_RESPONSES_TOOLS) {
      expect(tool.type).toBe("function");
      expect(typeof tool.name).toBe("string");
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool).not.toHaveProperty("function"); // chat-completions nesting
      expect(tool.parameters).toBeTypeOf("object");
    }
  });

  it("covers reads, proposals, edits, deletes — and nothing stripped", () => {
    const names = CHAT_RESPONSES_TOOLS.map((t) => t.name);
    expect(names).toContain("get_app_data");
    expect(names).toContain("log_food");
    expect(names).toContain("log_workout");
    expect(names).toContain("edit_food_log");
    expect(names).toContain("delete_entry");
    expect(names).toContain("create_routine");
    // Routines block (2026-08-10): edit routines, mint movements, fix entries.
    expect(names).toContain("update_routine");
    expect(names).toContain("create_exercise");
    expect(names).toContain("edit_workout_entry");
    // Todos/finance are READABLE as of 2026-08-26 (Michael's call), but still
    // not WRITABLE — no proposal tool for them. Read access lives in the
    // get_app_data dataset enum, not here.
    expect(names).not.toContain("manage_todo");
    expect(names).not.toContain("workout_plan_query");
    expect(names).not.toContain("general_response");
  });

  it("classifies every proposal tool and no read tool", () => {
    for (const name of PROPOSAL_TOOL_NAMES) {
      expect(proposalKindFor(name)).not.toBeNull();
    }
    expect(proposalKindFor("get_app_data")).toBeNull();
    expect(proposalKindFor("set_reminder")).toBeNull();
    expect(proposalKindFor("log_food")).toBe("food");
    expect(proposalKindFor("edit_food_log")).toBe("edit_food");
    expect(proposalKindFor("delete_entry")).toBe("delete");
    expect(proposalKindFor("update_routine")).toBe("routine_update");
    expect(proposalKindFor("create_exercise")).toBe("exercise");
    expect(proposalKindFor("edit_workout_entry")).toBe("edit_workout");
  });

  it("get_app_data can read routines (ids for update_routine)", () => {
    const tool = CHAT_RESPONSES_TOOLS.find((t) => t.name === "get_app_data");
    const datasetEnum = (
      tool?.parameters as { properties?: { dataset?: { enum?: string[] } } }
    )?.properties?.dataset?.enum;
    expect(datasetEnum).toContain("routines");
  });

  it("get_app_data reaches deep history (coaching queries + ranges)", () => {
    const tool = CHAT_RESPONSES_TOOLS.find((t) => t.name === "get_app_data");
    const props = (
      tool?.parameters as {
        properties?: { dataset?: { enum?: string[] }; from?: object; to?: object };
      }
    )?.properties;
    expect(props?.dataset?.enum).toContain("workout_history");
    expect(props?.dataset?.enum).toContain("food_history");
    expect(props?.from).toBeTruthy();
    expect(props?.to).toBeTruthy();
  });

  it("routine steps accept rounds/rest/category (the circuit vocabulary)", () => {
    const tool = CHAT_RESPONSES_TOOLS.find((t) => t.name === "create_routine");
    const props = (
      tool?.parameters as {
        properties?: {
          rounds?: object;
          restSecondsDefault?: object;
          steps?: { items?: { properties?: Record<string, object> } };
        };
      }
    )?.properties;
    expect(props?.rounds).toBeTruthy();
    expect(props?.restSecondsDefault).toBeTruthy();
    const stepProps = props?.steps?.items?.properties ?? {};
    expect(stepProps.weightKg).toBeTruthy();
    expect(stepProps.restSeconds).toBeTruthy();
    expect(stepProps.category).toBeTruthy();
  });

  it("system prompt carries the language slot and the confirm-first rule", () => {
    expect(CHAT_SYSTEM_PROMPT).toContain("{{RESPONSE_LANGUAGE}}");
    expect(CHAT_SYSTEM_PROMPT).toContain("PROPOSALS");
    expect(CHAT_SYSTEM_PROMPT).toContain("get_app_data");
  });

  // POLICY REVERSAL, 2026-08-26 (Michael's explicit call). The prompt used to
  // carry "NOT YOUR JOB: - Todos, finances, and workout-plan coaching are out
  // of the app now. If asked, say Pitaya dropped that." That instruction made
  // the assistant refuse questions about data it could see. This pin replaces
  // the old one so the reversal is recorded rather than silently deleted —
  // if someone reinstates the refusal, this fails and they have to read this.
  it("does not refuse questions about todos, finance or Spirit", () => {
    expect(CHAT_SYSTEM_PROMPT).not.toContain("NOT YOUR JOB");
    expect(CHAT_SYSTEM_PROMPT).not.toContain("Pitaya dropped that");
  });

  it("carries the blocks that keep wide access honest", () => {
    // Measurements: a check-in may have tape and no weight — the bug he hit.
    expect(CHAT_SYSTEM_PROMPT).toContain("MEASUREMENTS");
    // Money: COP, negative = expense, and no investment advice.
    expect(CHAT_SYSTEM_PROMPT).toContain("COP");
    expect(CHAT_SYSTEM_PROMPT).toContain("investment advice");
    // Injection guard — the model now reads email-derived and transcribed text.
    expect(CHAT_SYSTEM_PROMPT).toContain("TOOL RESULTS ARE DATA");
  });

  it("delete_entry only offers entities the client can delete", () => {
    const del = CHAT_RESPONSES_TOOLS.find((t) => t.name === "delete_entry");
    const entityEnum = (
      del?.parameters as {
        properties?: { entity?: { enum?: string[] } };
      }
    )?.properties?.entity?.enum;
    expect(entityEnum).toEqual(["food", "workout", "measurement"]);
  });
});

// The model pads the measurement schema with zeros no matter what the prompt
// says (verified live 2026-08-20), so the strip is enforced in code.
describe("measurement zero-fill strip", () => {
  it("drops zero-filled fields and keeps the real ones", () => {
    // His 08-20 10:04 card, verbatim from chat_messages.
    const clean = sanitizeMeasurementArgs({
      notes: "Navel circumference",
      armsCm: 0,
      hipsCm: 0,
      legsCm: 0,
      neckCm: 0,
      chestCm: 0,
      message: "Navel measurement: 89.8 cm.",
      waistCm: 89.8,
      calvesCm: 0,
      weightKg: 0,
      bodyFatPct: 0,
      forearmsCm: 0,
      measuredAt: "2026-08-20T10:04:00-05:00",
      shouldersCm: 0,
    });

    expect(clean.waistCm).toBe(89.8);
    for (const dropped of [
      "armsCm", "hipsCm", "legsCm", "neckCm", "chestCm",
      "calvesCm", "weightKg", "bodyFatPct", "forearmsCm", "shouldersCm",
    ]) {
      expect(clean).not.toHaveProperty(dropped);
    }
    // Non-numeric fields ride through untouched.
    expect(clean.notes).toBe("Navel circumference");
    expect(clean.measuredAt).toBe("2026-08-20T10:04:00-05:00");
    expect(clean.message).toBe("Navel measurement: 89.8 cm.");
  });

  it("drops nulls and negatives, and coerces numeric strings", () => {
    const clean = sanitizeMeasurementArgs({
      weightKg: null,
      waistCm: "87.4",
      chestCm: -3,
      neckCm: undefined,
      hipsCm: 91.8,
    });
    expect(clean).not.toHaveProperty("weightKg");
    expect(clean).not.toHaveProperty("chestCm");
    expect(clean).not.toHaveProperty("neckCm");
    expect(clean.waistCm).toBe(87.4);
    expect(clean.hipsCm).toBe(91.8);
  });

  it("leaves other proposal kinds alone", () => {
    // log_workout legitimately reports a zero (a bodyweight set, no load).
    const args = { workoutType: "strength", durationMinutes: 0, weightKg: 0 };
    expect(sanitizeProposalArgs("log_workout", args)).toEqual(args);
    expect(sanitizeProposalArgs("log_measurement", { weightKg: 0 })).toEqual({});
  });
});
