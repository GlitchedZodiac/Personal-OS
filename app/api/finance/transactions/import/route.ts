import { NextRequest, NextResponse } from "next/server";
import { ingestFinanceCandidate, guessCategoryFromText } from "@/lib/finance/ingestion";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { csvText, accountId } = body as {
      csvText?: string;
      accountId?: string;
    };

    if (!csvText || !accountId) {
      return NextResponse.json(
        { error: "csvText and accountId are required" },
        { status: 400 }
      );
    }

    const account = await prisma.financialAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const lines = csvText.trim().split("\n");
    if (lines.length < 2) {
      return NextResponse.json(
        { error: "CSV must have at least a header and one data row" },
        { status: 400 }
      );
    }

    const separator = lines[0].includes("\t") ? "\t" : ",";
    const headers = lines[0]
      .toLowerCase()
      .split(separator)
      .map((value) => value.trim().replace(/"/g, ""));
    const dateCol = headers.findIndex((value) =>
      ["fecha", "date", "fecha transaccion", "fecha_transaccion"].includes(value)
    );
    const descCol = headers.findIndex((value) =>
      ["descripcion", "description", "concepto", "detalle"].includes(value)
    );
    const amountCol = headers.findIndex((value) =>
      ["monto", "valor", "amount", "value", "importe"].includes(value)
    );
    const debitCol = headers.findIndex((value) =>
      ["debito", "debit", "cargo"].includes(value)
    );
    const creditCol = headers.findIndex((value) =>
      ["credito", "credit", "abono"].includes(value)
    );
    const refCol = headers.findIndex((value) =>
      ["referencia", "reference", "ref", "numero"].includes(value)
    );

    const created = [];

    for (let index = 1; index < lines.length; index += 1) {
      const columns = lines[index]
        .split(separator)
        .map((value) => value.trim().replace(/"/g, ""));
      if (columns.length < 2) continue;

      const dateValue = dateCol >= 0 ? columns[dateCol] : columns[0];
      const description = descCol >= 0 ? columns[descCol] : columns[1];

      let amount: number;
      if (debitCol >= 0 && creditCol >= 0) {
        const debit = parseFloat(columns[debitCol]?.replace(/[^0-9.-]/g, "") || "0");
        const credit = parseFloat(columns[creditCol]?.replace(/[^0-9.-]/g, "") || "0");
        amount = credit > 0 ? credit : debit;
      } else {
        amount = parseFloat(
          (amountCol >= 0 ? columns[amountCol] : columns[2])?.replace(/[^0-9.-]/g, "") || "0"
        );
      }

      if (!description || Number.isNaN(amount)) continue;

      const guessed = guessCategoryFromText(description);
      const type = creditCol >= 0 && Number(columns[creditCol]) > 0 ? "income" : amount > 0 ? "expense" : "expense";

      const result = await ingestFinanceCandidate({
        accountId,
        transactedAt: dateValue ? new Date(dateValue) : new Date(),
        amount: Math.abs(amount),
        currency: account.currency,
        description,
        category: guessed.category,
        subcategory: guessed.subcategory,
        type,
        reference: refCol >= 0 ? columns[refCol] : null,
        source: "csv_import",
        confidence: guessed.confidence,
      });

      if (result.transaction) {
        created.push(result.transaction);
      }
    }

    return NextResponse.json({
      imported: created.length,
      transactions: created,
    });
  } catch (error) {
    console.error("Error importing transactions:", error);
    return NextResponse.json({ error: "Failed to import transactions" }, { status: 500 });
  }
}
