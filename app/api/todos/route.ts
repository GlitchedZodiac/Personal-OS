import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assignTodoIcon } from "@/lib/todo-icons";
import { startOfDay, endOfDay } from "date-fns";

// GET - Fetch all todos (oldest first by due date, then creation)
export async function GET() {
  try {
    // Spawn recurring tasks for today if needed
    await spawnRecurringTasks();

    // Backfill icons for todos that don't have them
    await backfillIcons();

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
    const { title, notes, dueDate, priority, category, isRecurring, recurrence } = body;

    if (!title || typeof title !== "string" || title.trim() === "") {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    // Auto-assign icon based on title
    const icon = assignTodoIcon(title.trim());

    const todo = await prisma.todo.create({
      data: {
        title: title.trim(),
        notes: notes || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        priority: priority || "normal",
        icon,
        category: category || (isRecurring ? "recurring" : "manual"),
        isRecurring: isRecurring || false,
        recurrence: isRecurring ? (recurrence || "daily") : null,
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
    const { id, title, notes, dueDate, completed, priority, icon, category, isRecurring, recurrence } = body;

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) {
      updateData.title = title;
      // Re-assign icon when title changes
      updateData.icon = assignTodoIcon(title);
    }
    if (notes !== undefined) updateData.notes = notes;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
    if (priority !== undefined) updateData.priority = priority;
    if (icon !== undefined) updateData.icon = icon;
    if (category !== undefined) updateData.category = category;
    if (isRecurring !== undefined) updateData.isRecurring = isRecurring;
    if (recurrence !== undefined) updateData.recurrence = recurrence;
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

// ─── Recurring Task Spawning ─────────────────────────────────────────
async function spawnRecurringTasks() {
  try {
    // Get all recurring templates
    const templates = await prisma.todo.findMany({
      where: { isRecurring: true, recurrence: { not: null } },
    });

    if (templates.length === 0) return;

    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());

    for (const template of templates) {
      // Check if today's instance already exists
      const existingToday = await prisma.todo.findFirst({
        where: {
          recurrenceParentId: template.id,
          dueDate: { gte: todayStart, lte: todayEnd },
        },
      });

      if (existingToday) continue; // Already spawned for today

      // Check if this recurrence is due today
      const shouldSpawn = shouldSpawnToday(template.recurrence!, template.dueDate);
      if (!shouldSpawn) continue;

      // Create today's instance
      await prisma.todo.create({
        data: {
          title: template.title,
          notes: template.notes,
          dueDate: new Date(), // Due today
          priority: template.priority,
          icon: template.icon,
          category: "recurring",
          isRecurring: false, // Instance, not template
          recurrenceParentId: template.id,
        },
      });
    }
  } catch (error) {
    console.error("Recurring task spawn error:", error);
    // Non-critical, don't throw
  }
}

function shouldSpawnToday(recurrence: string, templateDueDate: Date | null): boolean {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat

  switch (recurrence) {
    case "daily":
      return true;
    case "weekdays":
      return dayOfWeek >= 1 && dayOfWeek <= 5;
    case "weekly":
      // Spawn on the same day of week as the template's due date, or Monday if no due date
      if (templateDueDate) {
        return dayOfWeek === templateDueDate.getDay();
      }
      return dayOfWeek === 1; // Monday
    case "monthly":
      // Spawn on the same day of month, or 1st if no due date
      if (templateDueDate) {
        return now.getDate() === templateDueDate.getDate();
      }
      return now.getDate() === 1;
    default:
      return false;
  }
}

// ─── Backfill Icons ──────────────────────────────────────────────────
async function backfillIcons() {
  try {
    const todosWithoutIcons = await prisma.todo.findMany({
      where: { icon: null },
      select: { id: true, title: true },
    });

    if (todosWithoutIcons.length === 0) return;

    // Batch update icons
    await Promise.all(
      todosWithoutIcons.map((todo) =>
        prisma.todo.update({
          where: { id: todo.id },
          data: { icon: assignTodoIcon(todo.title) },
        })
      )
    );
  } catch (error) {
    console.error("Backfill icons error:", error);
    // Non-critical, don't throw
  }
}
