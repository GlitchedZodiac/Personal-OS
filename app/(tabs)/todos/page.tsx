"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Circle,
  CheckCircle2,
  Plus,
  Trash2,
  Calendar,
  ListTodo,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, isToday, isTomorrow, isPast, parseISO } from "date-fns";

interface Todo {
  id: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  completed: boolean;
  completedAt: string | null;
  priority: string;
  createdAt: string;
}

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("active");

  const fetchTodos = useCallback(async () => {
    try {
      const res = await fetch("/api/todos");
      if (res.ok) {
        const data = await res.json();
        setTodos(data);
      }
    } catch (error) {
      console.error("Failed to fetch todos:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  const addTodo = async () => {
    if (!newTitle.trim()) return;
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          dueDate: newDueDate || null,
        }),
      });
      if (res.ok) {
        const todo = await res.json();
        setTodos((prev) => [...prev, todo]);
        setNewTitle("");
        setNewDueDate("");
        setShowAdd(false);
        toast.success("Todo added!");
      }
    } catch {
      toast.error("Failed to add todo");
    }
  };

  const toggleTodo = async (id: string, completed: boolean) => {
    try {
      const res = await fetch("/api/todos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, completed: !completed }),
      });
      if (res.ok) {
        const updated = await res.json();
        setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)));
      }
    } catch {
      toast.error("Failed to update todo");
    }
  };

  const deleteTodo = async (id: string) => {
    try {
      const res = await fetch(`/api/todos?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setTodos((prev) => prev.filter((t) => t.id !== id));
        toast.success("Deleted");
      }
    } catch {
      toast.error("Failed to delete");
    }
  };

  const formatDueDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    const d = parseISO(dateStr);
    const hasTime = dateStr.includes("T") && !dateStr.includes("T12:00:00");
    const timeStr = hasTime ? ` at ${format(d, "h:mm a")}` : "";
    if (isToday(d)) return `Today${timeStr}`;
    if (isTomorrow(d)) return `Tomorrow${timeStr}`;
    return format(d, "MMM d") + timeStr;
  };

  const isDueOverdue = (dateStr: string | null, completed: boolean) => {
    if (!dateStr || completed) return false;
    const d = parseISO(dateStr);
    return isPast(d) && !isToday(d);
  };

  // Sort: incomplete first (oldest to newest by due date/created), then completed
  const sortedTodos = [...todos].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    // Both same completion status — sort by due date (nulls last), then createdAt
    const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    if (aDue !== bDue) return aDue - bDue;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const filtered = sortedTodos.filter((t) => {
    if (filter === "active") return !t.completed;
    if (filter === "completed") return t.completed;
    return true;
  });

  const activeCount = todos.filter((t) => !t.completed).length;
  const completedCount = todos.filter((t) => t.completed).length;

  return (
    <div className="px-4 pt-12 pb-36 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Todos</h1>
          <p className="text-xs text-muted-foreground">
            {activeCount} active{completedCount > 0 ? ` · ${completedCount} done` : ""}
          </p>
        </div>
        <Button
          size="icon"
          className="h-10 w-10 rounded-full"
          onClick={() => setShowAdd(!showAdd)}
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>

      {/* Quick add */}
      {showAdd && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="What do you need to do?"
              className="text-sm"
              onKeyDown={(e) => e.key === "Enter" && addTodo()}
              autoFocus
            />
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 flex-1">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="text-xs h-8 flex-1"
                />
              </div>
              <Button size="sm" onClick={addTodo} disabled={!newTitle.trim()}>
                Add
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 bg-secondary/30 rounded-lg p-0.5">
        {(["active", "all", "completed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "flex-1 text-xs font-medium py-1.5 rounded-md transition-all capitalize",
              filter === f
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Todo list */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
          Loading...
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <ListTodo className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">
              {filter === "completed" ? "No completed todos yet" : "All clear!"}
            </p>
            <p className="text-xs mt-1">
              {filter === "active"
                ? "Add a todo or tell the AI on the home page"
                : "Your completed items will appear here"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((todo) => {
            const dueDateLabel = formatDueDate(todo.dueDate);
            const overdue = isDueOverdue(todo.dueDate, todo.completed);

            return (
              <div
                key={todo.id}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-xl transition-all group",
                  todo.completed ? "opacity-50" : "bg-card border border-border/50"
                )}
              >
                {/* Circle checkbox */}
                <button
                  onClick={() => toggleTodo(todo.id, todo.completed)}
                  className="mt-0.5 shrink-0 transition-colors"
                >
                  {todo.completed ? (
                    <CheckCircle2 className="h-5 w-5 text-green-400" />
                  ) : (
                    <Circle className={cn(
                      "h-5 w-5",
                      overdue ? "text-red-400" : "text-muted-foreground/40 hover:text-primary"
                    )} />
                  )}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm leading-tight",
                    todo.completed && "line-through text-muted-foreground"
                  )}>
                    {todo.title}
                  </p>
                  {dueDateLabel && (
                    <p className={cn(
                      "text-[10px] mt-1 flex items-center gap-1",
                      overdue
                        ? "text-red-400 font-medium"
                        : "text-muted-foreground"
                    )}>
                      <Calendar className="h-2.5 w-2.5" />
                      {dueDateLabel}
                      {overdue && " · overdue"}
                    </p>
                  )}
                </div>

                {/* Delete button */}
                <button
                  onClick={() => deleteTodo(todo.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
