import { describe, expect, it } from "vitest";
import { HEALTH_TOOLS, TRANSCRIBE_PROMPT } from "@/lib/ai-prompts";

// Guards the modern tools-API surface the chat route depends on. If a tool
// definition drifts (wrong shape, missing fields), the chat silently loses a
// capability — this pins the contract.

describe("HEALTH_TOOLS", () => {
  it("exposes all eight capabilities in modern tools shape", () => {
    expect(HEALTH_TOOLS).toHaveLength(8);
    for (const tool of HEALTH_TOOLS) {
      expect(tool.type).toBe("function");
      expect(tool.function.name).toBeTruthy();
      expect(tool.function.parameters).toBeTypeOf("object");
    }
  });

  it("has unique, expected tool names", () => {
    const names = HEALTH_TOOLS.map((t) => t.function.name).sort();
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      [
        "general_response",
        "log_food",
        "log_measurement",
        "log_water",
        "log_workout",
        "manage_todo",
        "set_reminder",
        "workout_plan_query",
      ].sort()
    );
  });

  it("requires items and message on log_food", () => {
    const food = HEALTH_TOOLS.find((t) => t.function.name === "log_food")!;
    const params = food.function.parameters as unknown as {
      required: string[];
      properties: { items: { items: { required: string[] } } };
    };
    expect(params.required).toEqual(expect.arrayContaining(["items", "message"]));
    expect(params.properties.items.items.required).toEqual(
      expect.arrayContaining([
        "mealType",
        "foodDescription",
        "calories",
        "proteinG",
        "carbsG",
        "fatG",
      ])
    );
  });

  it("captures sets, reps, and weight on log_workout exercises", () => {
    const workout = HEALTH_TOOLS.find((t) => t.function.name === "log_workout")!;
    const params = workout.function.parameters as unknown as {
      properties: {
        exercises: { items: { properties: Record<string, unknown> } };
      };
    };
    expect(Object.keys(params.properties.exercises.items.properties)).toEqual(
      expect.arrayContaining(["name", "sets", "reps", "weightKg"])
    );
  });
});

describe("TRANSCRIBE_PROMPT", () => {
  it("biases toward the kettlebell + macro + Colombian food domain", () => {
    for (const term of ["kettlebell", "goblet squat", "PR", "macros", "arepa"]) {
      expect(TRANSCRIBE_PROMPT).toContain(term);
    }
  });
});
