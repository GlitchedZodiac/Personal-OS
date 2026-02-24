import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";

export const maxDuration = 60;

// Default category mapping for common transaction types
const CATEGORY_KEYWORDS: Record<string, { category: string; subcategory?: string }> = {
  // Food
  rappi: { category: "food", subcategory: "delivery" },
  ifood: { category: "food", subcategory: "delivery" },
  exito: { category: "food", subcategory: "groceries" },
  carulla: { category: "food", subcategory: "groceries" },
  jumbo: { category: "food", subcategory: "groceries" },
  d1: { category: "food", subcategory: "groceries" },
  ara: { category: "food", subcategory: "groceries" },
  restaurante: { category: "food", subcategory: "dining_out" },
  // Transport
  uber: { category: "transport", subcategory: "rideshare" },
  didi: { category: "transport", subcategory: "rideshare" },
  beat: { category: "transport", subcategory: "rideshare" },
  gasolina: { category: "transport", subcategory: "gas" },
  peaje: { category: "transport", subcategory: "tolls" },
  // Housing
  arriendo: { category: "housing", subcategory: "rent" },
  epm: { category: "housing", subcategory: "utilities" },
  agua: { category: "housing", subcategory: "utilities" },
  energia: { category: "housing", subcategory: "utilities" },
  gas: { category: "housing", subcategory: "utilities" },
  // Entertainment
  netflix: { category: "entertainment", subcategory: "streaming" },
  spotify: { category: "entertainment", subcategory: "streaming" },
  disney: { category: "entertainment", subcategory: "streaming" },
  hbo: { category: "entertainment", subcategory: "streaming" },
  youtube: { category: "entertainment", subcategory: "streaming" },
  // Health
  farmacia: { category: "health", subcategory: "pharmacy" },
  drogueria: { category: "health", subcategory: "pharmacy" },
  gym: { category: "health", subcategory: "fitness" },
  // Income
  nomina: { category: "income", subcategory: "salary" },
  salario: { category: "income", subcategory: "salary" },
};

function guessCategory(description: string): { category: string; subcategory?: string } {
  const lower = description.toLowerCase();
  for (const [keyword, cat] of Object.entries(CATEGORY_KEYWORDS)) {
    if (lower.includes(keyword)) return cat;
  }
  return { category: "other" };
}

// POST /api/finance/transactions/import — import transactions from CSV text
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { csvText, accountId, useAI = false } = body;

    if (!csvText || !accountId) {
      return NextResponse.json(
        { error: "csvText and accountId are required" },
        { status: 400 }
      );
    }

    // Verify account exists
    const account = await prisma.financialAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    let parsedTransactions: Array<{
      transactedAt: string;
      amount: number;
      description: string;
      category: string;
      subcategory?: string;
      type: string;
      reference?: string;
    }>;

    if (useAI) {
      // Use AI to parse the CSV and categorize transactions
      const response = await openai.chat.completions.create({
        model: "gpt-5.2",
        max_completion_tokens: 4000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a financial data parser. Parse the CSV/text data of bank transactions and return a JSON array.
            
Return format:
{
  "transactions": [
    {
      "transactedAt": "2026-02-15T10:30:00", // ISO datetime
      "amount": -50000, // negative for expenses, positive for income
      "description": "Éxito Groceries", // cleaned up description
      "category": "food", // one of: food, transport, housing, entertainment, health, education, shopping, personal, insurance, debt_payment, savings, income, transfer, other
      "subcategory": "groceries", // optional subcategory
      "type": "expense", // income, expense, or transfer
      "reference": "REF123", // bank reference if available
      "merchant": "Éxito" // extracted merchant name if identifiable
    }
  ]
}

Currency is COP (Colombian Pesos). Be smart about categorization. 
Common Colombian merchants: Éxito, Carulla, Rappi, D1, Ara, EPM, Bancolombia.
Transfers between own accounts should be type "transfer".
Salary/nómina deposits should be type "income" category "income".`,
          },
          {
            role: "user",
            content: `Parse these bank transactions:\n\n${csvText}`,
          },
        ],
      });

      const parsed = JSON.parse(response.choices[0].message.content || "{}");
      parsedTransactions = parsed.transactions || [];
    } else {
      // Simple CSV parser — try to detect format
      const lines = csvText.trim().split("\n");
      if (lines.length < 2) {
        return NextResponse.json(
          { error: "CSV must have at least a header and one data row" },
          { status: 400 }
        );
      }

      const header = lines[0].toLowerCase();
      const isTabSeparated = header.includes("\t");
      const separator = isTabSeparated ? "\t" : ",";

      // Try to detect column positions
      const headers = header.split(separator).map((h: string) => h.trim().replace(/"/g, ""));
      const dateCol = headers.findIndex((h: string) =>
        ["fecha", "date", "fecha transacción", "fecha_transaccion"].includes(h)
      );
      const descCol = headers.findIndex((h: string) =>
        ["descripción", "descripcion", "description", "concepto", "detalle"].includes(h)
      );
      const amountCol = headers.findIndex((h: string) =>
        ["monto", "valor", "amount", "value", "importe"].includes(h)
      );
      const debitCol = headers.findIndex((h: string) =>
        ["debito", "débito", "debit", "cargo"].includes(h)
      );
      const creditCol = headers.findIndex((h: string) =>
        ["credito", "crédito", "credit", "abono"].includes(h)
      );
      const refCol = headers.findIndex((h: string) =>
        ["referencia", "reference", "ref", "numero"].includes(h)
      );

      parsedTransactions = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(separator).map((c: string) => c.trim().replace(/"/g, ""));
        if (cols.length < 2) continue;

        const dateStr = dateCol >= 0 ? cols[dateCol] : cols[0];
        const desc = descCol >= 0 ? cols[descCol] : cols[1];

        let amount: number;
        if (debitCol >= 0 && creditCol >= 0) {
          const debit = parseFloat(cols[debitCol]?.replace(/[^0-9.-]/g, "") || "0");
          const credit = parseFloat(cols[creditCol]?.replace(/[^0-9.-]/g, "") || "0");
          amount = credit > 0 ? credit : -debit;
        } else {
          amount = parseFloat(
            (amountCol >= 0 ? cols[amountCol] : cols[2])?.replace(/[^0-9.-]/g, "") || "0"
          );
        }

        if (!desc || isNaN(amount)) continue;

        const guessed = guessCategory(desc);
        const type = amount > 0 ? "income" : "expense";

        parsedTransactions.push({
          transactedAt: dateStr,
          amount,
          description: desc,
          category: guessed.category,
          subcategory: guessed.subcategory,
          type,
          reference: refCol >= 0 ? cols[refCol] : undefined,
        });
      }
    }

    // Create all transactions
    const created = await prisma.$transaction(
      parsedTransactions.map((tx) =>
        prisma.financialTransaction.create({
          data: {
            accountId,
            transactedAt: new Date(tx.transactedAt),
            amount: tx.amount,
            currency: account.currency,
            description: tx.description,
            category: tx.category,
            subcategory: tx.subcategory ?? null,
            type: tx.type,
            reference: tx.reference ?? null,
            source: useAI ? "csv_import" : "csv_import",
          },
        })
      )
    );

    // Update account balance with net amount
    const netAmount = parsedTransactions.reduce((sum, tx) => sum + tx.amount, 0);
    await prisma.financialAccount.update({
      where: { id: accountId },
      data: { balance: { increment: netAmount }, lastSyncedAt: new Date() },
    });

    return NextResponse.json({
      imported: created.length,
      transactions: parsedTransactions,
      netAmount,
    });
  } catch (error) {
    console.error("Error importing transactions:", error);
    return NextResponse.json(
      { error: "Failed to import transactions" },
      { status: 500 }
    );
  }
}
