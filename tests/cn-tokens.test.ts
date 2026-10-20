import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

// cn() merges Tailwind classes; it must treat the token names as what they
// are (sizes, radii, shadows), not as colours — or a size and a colour on
// the same element erase each other (the kit button's Night label did).

describe("cn — token-aware class merging", () => {
  it("keeps a token size AND a token colour together", () => {
    expect(cn("text-ui text-on-primary")).toBe("text-ui text-on-primary");
    expect(cn("text-on-primary text-body")).toBe("text-on-primary text-body");
  });

  it("still lets a later token size replace an earlier one", () => {
    expect(cn("text-ui", "text-body")).toBe("text-body");
    expect(cn("text-caption", "text-xs")).toBe("text-xs");
  });

  it("merges token radii and shadows with the stock ones", () => {
    expect(cn("rounded-full", "rounded-card")).toBe("rounded-card");
    expect(cn("shadow-sm", "shadow-card")).toBe("shadow-card");
  });

  it("still merges colours", () => {
    expect(cn("text-ink", "text-ink-2")).toBe("text-ink-2");
  });
});
