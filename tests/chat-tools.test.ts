import { describe, expect, it } from "vitest";
import { PROPOSAL_TOOL_NAMES, proposalKindFor } from "@/lib/chat-tools";
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
    expect(names).toContain("get_health_data");
    expect(names).toContain("log_food");
    expect(names).toContain("log_workout");
    expect(names).toContain("edit_food_log");
    expect(names).toContain("delete_entry");
    expect(names).toContain("create_routine");
    // Stripped surfaces must NOT resurface through chat.
    expect(names).not.toContain("manage_todo");
    expect(names).not.toContain("workout_plan_query");
    expect(names).not.toContain("general_response");
  });

  it("classifies every proposal tool and no read tool", () => {
    for (const name of PROPOSAL_TOOL_NAMES) {
      expect(proposalKindFor(name)).not.toBeNull();
    }
    expect(proposalKindFor("get_health_data")).toBeNull();
    expect(proposalKindFor("set_reminder")).toBeNull();
    expect(proposalKindFor("log_food")).toBe("food");
    expect(proposalKindFor("edit_food_log")).toBe("edit_food");
    expect(proposalKindFor("delete_entry")).toBe("delete");
  });

  it("system prompt carries the language slot and the confirm-first rule", () => {
    expect(CHAT_SYSTEM_PROMPT).toContain("{{RESPONSE_LANGUAGE}}");
    expect(CHAT_SYSTEM_PROMPT).toContain("PROPOSALS");
    expect(CHAT_SYSTEM_PROMPT).toContain("get_health_data");
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
