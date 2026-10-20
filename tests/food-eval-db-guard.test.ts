import { describe, expect, it } from "vitest";
// The eval harness's database guard (scripts/food-eval-db.mjs). The harness
// itself is on-demand; this test is not — the guard is what keeps a mistyped
// DATABASE_URL from pointing a row-deleting script at production.
import { isLoopbackHost, loopbackPgConfig } from "@/scripts/food-eval-db.mjs";

describe("loopbackPgConfig", () => {
  it("accepts the lane's local copy and returns the parsed config, TLS off", () => {
    const cfg = loopbackPgConfig("postgresql://zodiac:pw@127.0.0.1:5432/pitaya_lane_d?sslmode=disable");
    expect(cfg).toMatchObject({ host: "127.0.0.1", port: 5432, database: "pitaya_lane_d", user: "zodiac", password: "pw", ssl: false });
  });

  it("accepts localhost and IPv6 loopback", () => {
    expect(loopbackPgConfig("postgres://u@localhost/db").host).toBe("localhost");
    expect(isLoopbackHost("[::1]")).toBe(true);
  });

  it("REFUSES a ?host= override — the bypass the review found", () => {
    expect(() => loopbackPgConfig("postgresql://u:p@127.0.0.1:5432/db?host=prod.example.com")).toThrow(/overrides the connection/);
    expect(() => loopbackPgConfig("postgresql://u:p@127.0.0.1:5432/db?HOST=prod.example.com")).toThrow(/overrides the connection/);
    expect(() => loopbackPgConfig("postgresql://u:p@localhost/db?hostaddr=10.0.0.5")).toThrow(/overrides the connection/);
    expect(() => loopbackPgConfig("postgresql://u:p@localhost/db?sslmode=disable&host=db.supabase.co")).toThrow(/overrides the connection/);
  });

  it("refuses any non-loopback host, including look-alikes", () => {
    for (const url of [
      "postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
      "postgresql://u:p@localhost.example.com/db",
      "postgresql://u:p@10.0.0.1/db",
      "postgresql://u:p@127.0.0.2/db",
    ]) {
      expect(() => loopbackPgConfig(url), url).toThrow(/non-loopback/);
    }
  });

  it("refuses other connection-steering parameters and a TLS mode other than disable", () => {
    expect(() => loopbackPgConfig("postgresql://u@127.0.0.1/db?port=6543")).toThrow(/overrides/);
    expect(() => loopbackPgConfig("postgresql://u@127.0.0.1/db?sslmode=require")).toThrow(/overrides/);
    expect(() => loopbackPgConfig("postgresql://u@127.0.0.1/db?service=prod")).toThrow(/overrides/);
  });

  it("refuses an empty value, a non-URL and a non-postgres scheme", () => {
    expect(() => loopbackPgConfig(undefined as unknown as string)).toThrow(/missing/);
    expect(() => loopbackPgConfig("not a url")).toThrow(/not a URL/);
    expect(() => loopbackPgConfig("mysql://u@127.0.0.1/db")).toThrow(/non-postgres/);
  });
});
