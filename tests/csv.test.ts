import { describe, expect, it } from "vitest";
import { escapeCsvValue, toCsv } from "@/lib/csv";

describe("escapeCsvValue", () => {
  it("distinguishes null from zero", () => {
    // A missing waistCm is not 0, and visceralFat: 0 is a real reading.
    expect(escapeCsvValue(null)).toBe("");
    expect(escapeCsvValue(undefined)).toBe("");
    expect(escapeCsvValue(0)).toBe("0");
  });

  it("keeps empty string distinguishable from null", () => {
    expect(escapeCsvValue("")).toBe('""');
  });

  it("never leaks NaN or Infinity", () => {
    expect(escapeCsvValue(Number.NaN)).toBe("");
    expect(escapeCsvValue(Number.POSITIVE_INFINITY)).toBe("");
  });

  it("quotes on delimiter, quote, CR and LF", () => {
    expect(escapeCsvValue("a,b")).toBe('"a,b"');
    expect(escapeCsvValue('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvValue("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeCsvValue("line1\r\nline2")).toBe('"line1\r\nline2"');
  });

  it("quotes leading and trailing whitespace so trimming parsers cannot eat it", () => {
    expect(escapeCsvValue(" padded ")).toBe('" padded "');
  });

  it("leaves a plain value alone", () => {
    expect(escapeCsvValue("chest")).toBe("chest");
    expect(escapeCsvValue(104.5)).toBe("104.5");
  });

  it("honours a semicolon delimiter", () => {
    expect(escapeCsvValue("a,b", ";")).toBe("a,b");
    expect(escapeCsvValue("a;b", ";")).toBe('"a;b"');
  });

  it("passes accented characters through untouched", () => {
    expect(escapeCsvValue("almuerzo con ñame y café")).toBe(
      "almuerzo con ñame y café"
    );
  });
});

describe("toCsv", () => {
  it("writes a BOM by default and CRLF line endings", () => {
    const csv = toCsv(["a", "b"], [[1, 2]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe("﻿a,b\r\n1,2\r\n");
  });

  it("can omit the BOM", () => {
    expect(toCsv(["a"], [[1]], { bom: false })).toBe("a\r\n1\r\n");
  });

  it("emits a header-only file for zero rows", () => {
    expect(toCsv(["a", "b"], [], { bom: false })).toBe("a,b\r\n");
  });

  it("keeps a multiline cell inside one quoted field", () => {
    const csv = toCsv(["notes"], [['two\nlines and a "quote"']], { bom: false });
    expect(csv).toBe('notes\r\n"two\nlines and a ""quote"""\r\n');
    // One header row + one record; the embedded \n must not create a record.
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(2);
  });
});
