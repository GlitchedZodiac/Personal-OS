import { NextRequest, NextResponse } from "next/server";
import { INT_FIELDS, MEASURED_FIELDS, stampSources } from "@/lib/body-measurements";
import { prisma } from "@/lib/prisma";

// GET - List body measurements
export async function GET() {
  try {
    const entries = await prisma.bodyMeasurement.findMany({
      orderBy: { measuredAt: "desc" },
      take: 100,
      // The untouched source record is an archive, not screen data — a
      // hundred of them would be most of this response.
      omit: { rawPayload: true },
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

    // Every measured column, from the shared vocabulary. This route used to
    // list eleven by hand, silently dropping any scale value it was sent, and
    // left `source` null — a row of unknown origin.
    const fields: Record<string, number> = {};
    for (const field of MEASURED_FIELDS) {
      const value = Number(body[field]);
      if (body[field] != null && Number.isFinite(value) && value > 0) {
        fields[field] = INT_FIELDS.has(field) ? Math.round(value) : value;
      }
    }

    const entry = await prisma.bodyMeasurement.create({
      data: {
        measuredAt: body.measuredAt ? new Date(body.measuredAt) : undefined,
        ...fields,
        skinfoldData: body.skinfoldData || null,
        notes: body.notes || null,
        source: "manual",
        fieldSources: stampSources(fields, "manual"),
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

// PATCH - Update an existing body measurement
export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const body = await request.json();

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.measuredAt !== undefined) updateData.measuredAt = body.measuredAt ? new Date(body.measuredAt) : new Date();
    if (body.weightKg !== undefined) updateData.weightKg = body.weightKg;
    if (body.bodyFatPct !== undefined) updateData.bodyFatPct = body.bodyFatPct;
    if (body.waistCm !== undefined) updateData.waistCm = body.waistCm;
    if (body.chestCm !== undefined) updateData.chestCm = body.chestCm;
    if (body.armsCm !== undefined) updateData.armsCm = body.armsCm;
    if (body.legsCm !== undefined) updateData.legsCm = body.legsCm;
    if (body.hipsCm !== undefined) updateData.hipsCm = body.hipsCm;
    if (body.shouldersCm !== undefined) updateData.shouldersCm = body.shouldersCm;
    if (body.neckCm !== undefined) updateData.neckCm = body.neckCm;
    if (body.forearmsCm !== undefined) updateData.forearmsCm = body.forearmsCm;
    if (body.calvesCm !== undefined) updateData.calvesCm = body.calvesCm;
    if (body.skinfoldData !== undefined) updateData.skinfoldData = body.skinfoldData;
    if (body.notes !== undefined) updateData.notes = body.notes;

    const entry = await prisma.bodyMeasurement.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(entry);
  } catch (error) {
    console.error("Body measurement update error:", error);
    return NextResponse.json(
      { error: "Failed to update body measurement" },
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
