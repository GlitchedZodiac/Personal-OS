"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  Plus,
  Trash2,
  Calendar,
  ListTodo,
  Repeat,
  ChevronDown,
  ChevronUp,
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
  icon: string | null;
  category: string;
  isRecurring: boolean;
  recurrence: string | null;
  recurrenceParentId: string | null;
  createdAt: string;
}

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newRecurrence, setNewRecurrence] = useState<string>("none");
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("active");
  const [showRecurringTemplates, setShowRecurringTemplates] = useState(false);

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
      const isRecurring = newRecurrence !== "none";
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          dueDate: newDueDate || null,
          isRecurring,
          recurrence: isRecurring ? newRecurrence : null,
          category: isRecurring ? "recurring" : "manual",
        }),
      });
      if (res.ok) {
        const todo = await res.json();
        setTodos((prev) => [...prev, todo]);
        setNewTitle("");
        setNewDueDate("");
        setNewRecurrence("none");
        setShowAdd(false);
        toast.success(isRecurring ? "Recurring task created!" : "Todo added!");
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

  // Separate recurring templates from regular todos
  const recurringTemplates = todos.filter((t) => t.isRecurring);
  const regularTodos = todos.filter((t) => !t.isRecurring);

  // Group by category
  const appTodos = regularTodos.filter((t) => t.category === "app");
  const recurringInstances = regularTodos.filter((t) => t.category === "recurring" || t.recurrenceParentId);
  const manualTodos = regularTodos.filter((t) => t.category === "manual" && !t.recurrenceParentId);

  // Sort function
  const sortTodos = (list: Todo[]) =>
    [...list].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      if (aDue !== bDue) return aDue - bDue;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

  const filterTodos = (list: Todo[]) =>
    sortTodos(list).filter((t) => {
      if (filter === "active") return !t.completed;
      if (filter === "completed") return t.completed;
      return true;
    });

  const activeCount = regularTodos.filter((t) => !t.completed).length;
  const completedCount = regularTodos.filter((t) => t.completed).length;

  // Sections with filtered todos
  const sections = [
    { key: "recurring", label: "Recurring", icon: "🔁", color: "text-amber-400", todos: filterTodos(recurringInstances) },
    { key: "app", label: "App", icon: "📱", color: "text-purple-400", todos: filterTodos(appTodos) },
    { key: "manual", label: "Personal", icon: "📌", color: "text-blue-400", todos: filterTodos(manualTodos) },
  ].filter((s) => s.todos.length > 0);

  // If no sections have items, show combined list fallback
  const allFiltered = filterTodos(regularTodos);

  const renderAddCard = (className?: string) => (
    <Card className={className}>
      <CardContent className="space-y-3 p-4">
        <div>
          <p className="text-sm font-semibold">New task</p>
          <p className="text-xs text-muted-foreground">
            Capture one-offs or create a recurring routine.
          </p>
        </div>
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="What do you need to do?"
          className="text-sm"
          onKeyDown={(e) => e.key === "Enter" && addTodo()}
          autoFocus={showAdd}
        />
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <Input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="h-9 flex-1 text-xs"
            />
          </div>
          <Select value={newRecurrence} onValueChange={setNewRecurrence}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" side="bottom" sideOffset={4}>
              <SelectItem value="none">One-time</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekdays">Weekdays</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={addTodo} disabled={!newTitle.trim()} className="w-full">
          {newRecurrence !== "none" ? "Create Recurring Task" : "Add Todo"}
        </Button>
      </CardContent>
    </Card>
  );

  const recurringTemplatesPanel = recurringTemplates.length > 0 ? (
    <Card>
      <CardContent className="space-y-3 p-4">
        <button
          onClick={() => setShowRecurringTemplates(!showRecurringTemplates)}
          className="flex w-full items-center gap-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Repeat className="h-3.5 w-3.5" />
          <span className="font-medium">
            {recurringTemplates.length} recurring template{recurringTemplates.length !== 1 ? "s" : ""}
          </span>
          {showRecurringTemplates ? (
            <ChevronUp className="ml-auto h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="ml-auto h-3.5 w-3.5" />
          )}
        </button>
        {showRecurringTemplates && (
          <div className="space-y-1.5">
            {recurringTemplates.map((template) => (
              <div
                key={template.id}
                className="flex items-center gap-3 rounded-xl border border-amber-500/10 bg-amber-500/5 p-3"
              >
                <span className="text-lg">{template.icon || "ðŸ”"}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-tight">{template.title}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] capitalize text-amber-400">
                    <Repeat className="h-2.5 w-2.5" />
                    {template.recurrence}
                  </p>
                </div>
                <button
                  onClick={() => deleteTodo(template.id)}
                  className="rounded-lg p-1 transition-colors hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  ) : null;

  return (
    <div className="space-y-4 px-4 pt-12 pb-36 lg:space-y-6 lg:px-0 lg:pt-10 lg:pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
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

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="space-y-4 lg:sticky lg:top-6">
          {renderAddCard("hidden lg:block")}

          <Card className="hidden lg:block">
            <CardContent className="grid grid-cols-3 gap-3 p-4 text-center">
              <div className="rounded-xl bg-secondary/40 p-3">
                <p className="text-2xl font-bold">{activeCount}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Active</p>
              </div>
              <div className="rounded-xl bg-secondary/40 p-3">
                <p className="text-2xl font-bold">{completedCount}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Done</p>
              </div>
              <div className="rounded-xl bg-secondary/40 p-3">
                <p className="text-2xl font-bold">{recurringTemplates.length}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Routines</p>
              </div>
            </CardContent>
          </Card>

          <div className="hidden lg:block">{recurringTemplatesPanel}</div>
        </div>

        <div className="space-y-4">

      {/* Quick add */}
      {showAdd && (
        <div className="lg:hidden">{renderAddCard()}</div>
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
      ) : allFiltered.length === 0 ? (
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
        <div className="space-y-4">
          {sections.map((section) => (
            <div key={section.key}>
              {/* Section header */}
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="text-sm">{section.icon}</span>
                <span className={cn("text-xs font-semibold uppercase tracking-wider", section.color)}>
                  {section.label}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  ({section.todos.filter((t) => !t.completed).length})
                </span>
              </div>
              <div className="space-y-1.5">
                {section.todos.map((todo) => (
                  <TodoItem
                    key={todo.id}
                    todo={todo}
                    onToggle={toggleTodo}
                    onDelete={deleteTodo}
                    formatDueDate={formatDueDate}
                    isDueOverdue={isDueOverdue}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recurring Templates Manager */}
      {recurringTemplates.length > 0 && (
        <div className="pt-2 lg:hidden">
          <button
            onClick={() => setShowRecurringTemplates(!showRecurringTemplates)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            <Repeat className="h-3.5 w-3.5" />
            <span className="font-medium">{recurringTemplates.length} recurring template{recurringTemplates.length !== 1 ? "s" : ""}</span>
            {showRecurringTemplates ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
          </button>
          {showRecurringTemplates && (
            <div className="mt-2 space-y-1.5">
              {recurringTemplates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/10"
                >
                  <span className="text-lg">{template.icon || "🔁"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-tight">{template.title}</p>
                    <p className="text-[10px] text-amber-400 mt-0.5 capitalize flex items-center gap-1">
                      <Repeat className="h-2.5 w-2.5" />
                      {template.recurrence}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteTodo(template.id)}
                    className="p-1 rounded-lg hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
        </div>
      </div>
    </div>
  );
}

// ─── Todo Item Component ─────────────────────────────────────────────

function TodoItem({
  todo,
  onToggle,
  onDelete,
  formatDueDate,
  isDueOverdue,
}: {
  todo: Todo;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  formatDueDate: (d: string | null) => string | null;
  isDueOverdue: (d: string | null, completed: boolean) => boolean;
}) {
  const dueDateLabel = formatDueDate(todo.dueDate);
  const overdue = isDueOverdue(todo.dueDate, todo.completed);

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-xl transition-all group",
        todo.completed ? "opacity-50" : "bg-card border border-border/50"
      )}
    >
      {/* Icon + Checkbox */}
      <button
        onClick={() => onToggle(todo.id, todo.completed)}
        className="mt-0.5 shrink-0 transition-colors"
      >
        {todo.completed ? (
          <CheckCircle2 className="h-5 w-5 text-green-400" />
        ) : (
          <span className="text-lg leading-none">{todo.icon || "📌"}</span>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm leading-tight",
            todo.completed && "line-through text-muted-foreground"
          )}
        >
          {todo.title}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {dueDateLabel && (
            <span
              className={cn(
                "text-[10px] flex items-center gap-1",
                overdue ? "text-red-400 font-medium" : "text-muted-foreground"
              )}
            >
              <Calendar className="h-2.5 w-2.5" />
              {dueDateLabel}
              {overdue && " · overdue"}
            </span>
          )}
          {todo.recurrenceParentId && (
            <span className="text-[10px] text-amber-400 flex items-center gap-0.5">
              <Repeat className="h-2.5 w-2.5" />
              recurring
            </span>
          )}
        </div>
      </div>

      {/* Delete button — always visible on mobile, hover on desktop */}
      <button
        onClick={() => onDelete(todo.id)}
        className="opacity-50 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-destructive/10"
      >
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
      </button>
    </div>
  );
}
