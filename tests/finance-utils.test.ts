import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));
import {
  buildSourceFingerprint,
  detectPotentialFlags,
  guessCategoryFromText,
  normalizeMerchantName,
} from "@/lib/finance/ingestion";
import {
  buildFinanceSourceIdentity,
  inferFinanceDocumentClassification,
} from "@/lib/finance/pipeline-utils";
import {
  calculateBudgetRiskCards,
  calculateVendorConcentration,
} from "@/lib/finance/reports";

describe("finance ingestion helpers", () => {
  it("normalizes merchant names across accents and company suffixes", () => {
    expect(normalizeMerchantName("Éxito S.A.S.")).toBe("exito");
    expect(normalizeMerchantName("Uber, Inc.")).toBe("uber");
  });

  it("builds stable fingerprints for equivalent purchases", () => {
    const a = buildSourceFingerprint({
      source: "email",
      amount: 25900,
      description: "Exito grocery order",
      merchant: "Éxito S.A.S.",
      transactedAt: new Date("2026-03-15T12:00:00Z"),
    });
    const b = buildSourceFingerprint({
      source: "email",
      amount: 25900,
      description: "Exito grocery order",
      merchant: "exito sas",
      transactedAt: new Date("2026-03-15T18:30:00Z"),
    });

    expect(a).toBe(b);
  });

  it("guesses categories from known finance keywords", () => {
    expect(guessCategoryFromText("Uber trip to the airport").category).toBe("transport");
    expect(guessCategoryFromText("Spotify family plan payment").category).toBe("entertainment");
  });

  it("flags low-confidence refunds and password-protected documents for review", () => {
    expect(
      detectPotentialFlags({
        description: "Refund processed for duplicate charge",
        confidence: 0.4,
        amount: null,
        requiresPassword: true,
      })
    ).toEqual(
      expect.arrayContaining([
        "low_confidence",
        "missing_amount",
        "refund",
        "duplicate",
        "password_required",
      ])
    );
  });

  it("builds stable source identities from sender addresses", () => {
    const identity = buildFinanceSourceIdentity({
      source: "email",
      sender: '"Spotify" <no-reply@spotify.com>',
      subject: "Your receipt",
    });

    expect(identity.senderEmail).toBe("no-reply@spotify.com");
    expect(identity.senderDomain).toBe("spotify.com");
    expect(identity.sourceKey).toContain("spotify.com");
  });

  it("classifies promo noise as ignored instead of spend", () => {
    const classification = inferFinanceDocumentClassification({
      text: "Bogota flight deals you'll love. Fares from $48 this week only.",
      subject: "Flight Deals You'll Love",
    });

    expect(classification.classification).toBe("ignored");
    expect(classification.shouldIgnore).toBe(true);
  });

  it("classifies bill reminders as bill notices, not purchases", () => {
    const classification = inferFinanceDocumentClassification({
      text: "Minimum due COP 320.000 payment due 2026-03-25 statement balance COP 900.000",
      subject: "Your statement is ready",
    });

    expect(classification.classification).toBe("statement");
    expect(classification.signalKind).toBe("statement");
    expect(classification.defaultDisposition).toBe("bill_notice");
  });
});

describe("finance reports", () => {
  it("marks over-budget categories as off track", () => {
    expect(
      calculateBudgetRiskCards([
        { category: "Dining Out", planned: 100000, actual: 125000 },
        { category: "Transport", planned: 80000, actual: 60000 },
      ])
    ).toEqual([
      {
        category: "Dining Out",
        planned: 100000,
        actual: 125000,
        remaining: -25000,
        percentUsed: 125,
        status: "off_track",
      },
      {
        category: "Transport",
        planned: 80000,
        actual: 60000,
        remaining: 20000,
        percentUsed: 75,
        status: "on_track",
      },
    ]);
  });

  it("calculates vendor concentration percentages from spend totals", () => {
    const merchants = calculateVendorConcentration([
      {
        id: "m1",
        name: "Rappi",
        totalSpent: 60000,
        totalTax: 0,
        totalTip: 0,
        transactionCount: 4,
      },
      {
        id: "m2",
        name: "Exito",
        totalSpent: 40000,
        totalTax: 0,
        totalTip: 0,
        transactionCount: 3,
      },
    ]);

    expect(merchants.map((merchant) => merchant.shareOfSpend)).toEqual([60, 40]);
  });
});
