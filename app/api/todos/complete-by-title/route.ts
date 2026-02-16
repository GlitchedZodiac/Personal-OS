import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST - Find a todo by title (fuzzy match) and mark it complete
export async function POST(request: NextRequest) {
  try {
    const { title } = await request.json();

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    // Find incomplete todos that match (case-insensitive contains)
    const todos = await prisma.todo.findMany({
      where: {
        completed: false,
        title: {
          contains: title,
          mode: "insensitive",
        },
      },
      orderBy: { createdAt: "asc" },
    });

    if (todos.length === 0) {
      // Try a broader search with individual words
      const words = title.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
      const allTodos = await prisma.todo.findMany({
        where: { completed: false },
        orderBy: { createdAt: "asc" },
      });

      const match = allTodos.find((t) =>
        words.some((w: string) => t.title.toLowerCase().includes(w))
      );

      if (!match) {
        return NextResponse.json(
          { error: "No matching todo found" },
          { status: 404 }
        );
      }

      const updated = await prisma.todo.update({
        where: { id: match.id },
        data: { completed: true, completedAt: new Date() },
      });
      return NextResponse.json(updated);
    }

    // Complete the best match (first one)
    const updated = await prisma.todo.update({
      where: { id: todos[0].id },
      data: { completed: true, completedAt: new Date() },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Complete todo by title error:", error);
    return NextResponse.json({ error: "Failed to complete todo" }, { status: 500 });
  }
}
