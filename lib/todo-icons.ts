/**
 * Auto-assigns an emoji icon to a todo based on its title.
 * Uses keyword matching — fast, no AI call needed.
 */

const ICON_RULES: Array<{ keywords: string[]; icon: string }> = [
  // Communication
  { keywords: ["call", "phone", "ring", "dial"], icon: "📞" },
  { keywords: ["email", "mail", "send email", "inbox"], icon: "📧" },
  { keywords: ["text", "message", "sms", "whatsapp", "chat"], icon: "💬" },
  { keywords: ["meeting", "meet", "catch up", "sync", "standup", "1:1"], icon: "🤝" },
  { keywords: ["zoom", "video call", "teams", "google meet"], icon: "📹" },

  // Fitness & Health
  { keywords: ["workout", "exercise", "gym", "lift", "training", "strength"], icon: "🏋️" },
  { keywords: ["run", "running", "jog", "sprint"], icon: "🏃" },
  { keywords: ["walk", "steps", "walking"], icon: "🚶" },
  { keywords: ["hike", "hiking", "trail"], icon: "🥾" },
  { keywords: ["yoga", "stretch", "meditat"], icon: "🧘" },
  { keywords: ["swim", "pool", "swimming"], icon: "🏊" },
  { keywords: ["weigh", "scale", "body scan", "measurement"], icon: "⚖️" },
  { keywords: ["meal prep", "cook", "recipe"], icon: "🍳" },
  { keywords: ["water", "hydrat"], icon: "💧" },
  { keywords: ["sleep", "nap", "rest", "bed"], icon: "😴" },
  { keywords: ["vitamin", "supplement", "medicine", "pill", "medication"], icon: "💊" },

  // Errands & Tasks
  { keywords: ["groceries", "grocery", "shopping", "store", "buy", "purchase"], icon: "🛒" },
  { keywords: ["clean", "tidy", "vacuum", "laundry", "wash", "dishes"], icon: "🧹" },
  { keywords: ["cook", "dinner", "lunch", "breakfast", "eat"], icon: "🍽️" },
  { keywords: ["drive", "car", "uber", "pick up", "drop off", "school"], icon: "🚗" },
  { keywords: ["doctor", "dentist", "appointment", "checkup", "health"], icon: "🏥" },
  { keywords: ["pay", "bill", "payment", "invoice", "finance", "bank", "transfer"], icon: "💰" },
  { keywords: ["fix", "repair", "maintenance"], icon: "🔧" },
  { keywords: ["trash", "garbage", "recycle", "throw out"], icon: "🗑️" },

  // Work & Productivity
  { keywords: ["work", "office", "task", "project", "deadline"], icon: "💼" },
  { keywords: ["write", "blog", "article", "document", "report"], icon: "✍️" },
  { keywords: ["code", "deploy", "build", "dev", "programming", "debug"], icon: "💻" },
  { keywords: ["design", "figma", "mockup", "wireframe"], icon: "🎨" },
  { keywords: ["review", "feedback", "approve"], icon: "📋" },
  { keywords: ["plan", "strategy", "roadmap", "brainstorm"], icon: "🗺️" },
  { keywords: ["present", "presentation", "slides", "pitch"], icon: "📊" },

  // Personal & Social
  { keywords: ["birthday", "gift", "present", "party"], icon: "🎁" },
  { keywords: ["date", "dinner date", "valentine"], icon: "❤️" },
  { keywords: ["kids", "children", "school", "homework", "parent"], icon: "👨‍👧‍👦" },
  { keywords: ["read", "book", "study", "learn"], icon: "📚" },
  { keywords: ["travel", "trip", "flight", "hotel", "vacation", "pack"], icon: "✈️" },

  // Calendar & Time
  { keywords: ["schedule", "calendar", "remind", "reminder"], icon: "📅" },
  { keywords: ["deadline", "due", "urgent", "asap"], icon: "⏰" },
];

export function assignTodoIcon(title: string): string {
  const lower = title.toLowerCase();

  for (const rule of ICON_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return rule.icon;
    }
  }

  // Default icon
  return "📌";
}

/**
 * Maps a category to a display label and color.
 */
export const CATEGORY_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  manual: { label: "Personal", color: "text-blue-400", icon: "📌" },
  app: { label: "App", color: "text-purple-400", icon: "📱" },
  recurring: { label: "Recurring", color: "text-amber-400", icon: "🔁" },
};
