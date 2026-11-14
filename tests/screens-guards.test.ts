import { describe, expect, it } from "vitest";
import { baseRefusal, seedRefusal, writesUnderDocs } from "../scripts/screens-guards.mjs";

// The screen-audit tooling must never wipe a real database or write a real
// database's screens into the public repo (scripts/screens-guards.mjs).

describe("seedRefusal — only a local *_demo database may be wiped", () => {
  it("accepts localhost, 127.0.0.1 and ::1 with sslmode", () => {
    expect(seedRefusal("postgresql://u@localhost:5432/pitaya_lane_c_demo")).toBeNull();
    expect(seedRefusal("postgresql://u@127.0.0.1:5432/pitaya_lane_c_demo?sslmode=disable")).toBeNull();
    expect(seedRefusal("postgresql://u@[::1]:5432/x_demo?sslmode=disable")).toBeNull();
  });

  it("refuses a ?host= override that pg would honour", () => {
    expect(seedRefusal("postgresql://u:p@localhost/x_demo?host=db.example.com")).toMatch(/query parameter/);
  });

  it("refuses remote hosts and non-demo databases", () => {
    expect(seedRefusal("postgresql://u@db.example.com:5432/x_demo")).toMatch(/not local/);
    expect(seedRefusal("postgresql://u@127.0.0.1:5432/pitaya_lane_c")).toMatch(/_demo/);
    expect(seedRefusal("not a url")).toMatch(/not a postgres/);
  });
});

describe("baseRefusal — the screenshot script drives a local server only", () => {
  it("accepts http on localhost, 127.0.0.1 and [::1]", () => {
    expect(baseRefusal("http://localhost:3103")).toBeNull();
    expect(baseRefusal("http://127.0.0.1:3103")).toBeNull();
    expect(baseRefusal("http://[::1]:3103")).toBeNull();
  });

  it("refuses anything else, whatever its case", () => {
    expect(baseRefusal("https://personal-os-plum.vercel.app")).not.toBeNull();
    expect(baseRefusal("HTTPS://localhost:3103")).not.toBeNull();
    expect(baseRefusal("http://192.168.1.20:3103")).toMatch(/not local/);
    expect(baseRefusal("http://example.com")).toMatch(/not local/);
  });
});

describe("writesUnderDocs — which outputs need the seed marker", () => {
  it("is true for docs/ and anything inside it", () => {
    expect(writesUnderDocs("docs/design/screen-audit", "/repo")).toBe(true);
    expect(writesUnderDocs("./docs", "/repo")).toBe(true);
  });

  it("is false for the private folder and elsewhere", () => {
    expect(writesUnderDocs(".screens-private/prod", "/repo")).toBe(false);
    expect(writesUnderDocs("/tmp/x", "/repo")).toBe(false);
    expect(writesUnderDocs("docs-copy", "/repo")).toBe(false);
  });
});
