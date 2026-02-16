import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - Fetch all todos (oldest first by due date, then creation)
export async function GET() {
  try {
    const todos = await prisma.todo.findMany({
      orderBy: [
        { dueDate: { sort: "asc", nulls: "last" } },
        { createdAt: "asc" },
      ],
    });
    return NextResponse.json(todos);
  } catch (error) {
    console.error("Todos fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch todos" }, { status: 500 });
  }
}

// POST - Create a new todo
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, notes, dueDate, priority } = body;

    if (!title || typeof title !== "string" || title.trim() === "") {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const todo = await prisma.todo.create({
      data: {
        title: title.trim(),
        notes: notes || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        priority: priority || "normal",
      },
    });

    return NextResponse.json(todo);
  } catch (error) {
    console.error("Todo create error:", error);
    return NextResponse.json({ error: "Failed to create todo" }, { status: 500 });
  }
}

// PATCH - Update a todo (toggle complete, edit, etc.)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, title, notes, dueDate, completed, priority } = body;

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (notes !== undefined) updateData.notes = notes;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
    if (priority !== undefined) updateData.priority = priority;
    if (completed !== undefined) {
      updateData.completed = completed;
      updateData.completedAt = completed ? new Date() : null;
    }

    const todo = await prisma.todo.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(todo);
  } catch (error) {
    console.error("Todo update error:", error);
    return NextResponse.json({ error: "Failed to update todo" }, { status: 500 });
  }
}

// DELETE - Delete a todo
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    await prisma.todo.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Todo delete error:", error);
    return NextResponse.json({ error: "Failed to delete todo" }, { status: 500 });
  }
}
