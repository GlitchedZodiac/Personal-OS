import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/finance/accounts — list all accounts
export async function GET() {
  try {
    const accounts = await prisma.financialAccount.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { transactions: true } },
      },
    });

    // Calculate net worth
    const netWorth = accounts.reduce((sum, a) => {
      if (a.accountType === "credit_card" || a.accountType === "loan") {
        return sum - Math.abs(a.balance); // debt is negative
      }
      return sum + a.balance;
    }, 0);

    const totalDebt = accounts
      .filter((a) => a.accountType === "credit_card" || a.accountType === "loan")
      .reduce((sum, a) => sum + Math.abs(a.balance), 0);

    const totalAssets = accounts
      .filter((a) => a.accountType !== "credit_card" && a.accountType !== "loan")
      .reduce((sum, a) => sum + a.balance, 0);

    return NextResponse.json({
      accounts,
      summary: { netWorth, totalDebt, totalAssets, accountCount: accounts.length },
    });
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
  }
}

// POST /api/finance/accounts — create a new account
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      accountType,
      currency = "COP",
      balance = 0,
      creditLimit,
      interestRate,
      institution,
      color,
      icon,
      notes,
    } = body;

    if (!name || !accountType) {
      return NextResponse.json(
        { error: "Name and account type are required" },
        { status: 400 }
      );
    }

    const account = await prisma.financialAccount.create({
      data: {
        name,
        accountType,
        currency,
        balance,
        creditLimit: creditLimit ?? null,
        interestRate: interestRate ?? null,
        institution: institution ?? null,
        color: color ?? null,
        icon: icon ?? null,
        notes: notes ?? null,
      },
    });

    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    console.error("Error creating account:", error);
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
  }
}

// PATCH /api/finance/accounts — update an account
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Account ID is required" }, { status: 400 });
    }

    const account = await prisma.financialAccount.update({
      where: { id },
      data: updates,
    });

    return NextResponse.json(account);
  } catch (error) {
    console.error("Error updating account:", error);
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
  }
}

// DELETE /api/finance/accounts — soft-delete (deactivate) an account
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Account ID is required" }, { status: 400 });
    }

    await prisma.financialAccount.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting account:", error);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}
