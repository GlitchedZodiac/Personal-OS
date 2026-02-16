import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - List body measurements
export async function GET() {
  try {
    const entries = await prisma.bodyMeasurement.findMany({
      orderBy: { measuredAt: "desc" },
      take: 100,
    });

    return NextResponse.json(entries);
  } catch (error) {
    console.error("Body measurement fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch body measurements" },
      { status: 500 }
    );
  }
}

// POST - Create a body measurement
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const entry = await prisma.bodyMeasurement.create({
      data: {
        weightKg: body.weightKg || null,
        bodyFatPct: body.bodyFatPct || null,
        waistCm: body.waistCm || null,
        chestCm: body.chestCm || null,
        armsCm: body.armsCm || null,
        legsCm: body.legsCm || null,
        hipsCm: body.hipsCm || null,
        shouldersCm: body.shouldersCm || null,
        neckCm: body.neckCm || null,
        forearmsCm: body.forearmsCm || null,
        calvesCm: body.calvesCm || null,
        skinfoldData: body.skinfoldData || null,
        notes: body.notes || null,
      },
    });

    return NextResponse.json(entry);
  } catch (error) {
    console.error("Body measurement create error:", error);
    return NextResponse.json(
      { error: "Failed to create body measurement" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a body measurement
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    await prisma.bodyMeasurement.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Body measurement delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete body measurement" },
      { status: 500 }
    );
  }
}
