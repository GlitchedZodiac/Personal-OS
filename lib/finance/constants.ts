export const FINANCE_REVIEW_THRESHOLD = 0.75;
export const FINANCE_GMAIL_SYNC_MINUTES = 15;
export const FINANCE_GMAIL_LOOKBACK_MONTHS = 12;

export const FINANCE_CATEGORIES = [
  "food",
  "dining_out",
  "transport",
  "housing",
  "utilities",
  "entertainment",
  "health",
  "education",
  "shopping",
  "personal",
  "insurance",
  "debt_payment",
  "savings",
  "income",
  "transfer",
  "other",
] as const;

export type FinanceCategory = (typeof FINANCE_CATEGORIES)[number];

export const FINANCE_CATEGORY_KEYWORDS: Record<
  string,
  { category: FinanceCategory; subcategory?: string; type?: "income" | "expense" | "transfer"; confidence?: number }
> = {
  rappi: { category: "food", subcategory: "delivery", type: "expense", confidence: 0.86 },
  ifood: { category: "food", subcategory: "delivery", type: "expense", confidence: 0.84 },
  uber: { category: "transport", subcategory: "rideshare", type: "expense", confidence: 0.88 },
  didi: { category: "transport", subcategory: "rideshare", type: "expense", confidence: 0.86 },
  exito: { category: "food", subcategory: "groceries", type: "expense", confidence: 0.9 },
  carulla: { category: "food", subcategory: "groceries", type: "expense", confidence: 0.88 },
  jumbo: { category: "food", subcategory: "groceries", type: "expense", confidence: 0.88 },
  netflix: { category: "entertainment", subcategory: "streaming", type: "expense", confidence: 0.95 },
  spotify: { category: "entertainment", subcategory: "streaming", type: "expense", confidence: 0.95 },
  youtube: { category: "entertainment", subcategory: "streaming", type: "expense", confidence: 0.9 },
  arriendo: { category: "housing", subcategory: "rent", type: "expense", confidence: 0.9 },
  rent: { category: "housing", subcategory: "rent", type: "expense", confidence: 0.9 },
  nomina: { category: "income", subcategory: "salary", type: "income", confidence: 0.92 },
  salario: { category: "income", subcategory: "salary", type: "income", confidence: 0.92 },
  salary: { category: "income", subcategory: "salary", type: "income", confidence: 0.92 },
  transferencia: { category: "transfer", subcategory: "internal_transfer", type: "transfer", confidence: 0.84 },
  transfer: { category: "transfer", subcategory: "internal_transfer", type: "transfer", confidence: 0.84 },
  amazon: { category: "shopping", subcategory: "online", type: "expense", confidence: 0.85 },
  mercado: { category: "food", subcategory: "groceries", type: "expense", confidence: 0.76 },
  drogueria: { category: "health", subcategory: "pharmacy", type: "expense", confidence: 0.84 },
  farmacia: { category: "health", subcategory: "pharmacy", type: "expense", confidence: 0.84 },
  gym: { category: "health", subcategory: "fitness", type: "expense", confidence: 0.8 },
};

export const FINANCE_IMPORTANT_KEYWORDS = [
  "receipt",
  "invoice",
  "payment",
  "paid",
  "purchase",
  "subscription",
  "bill",
  "statement",
  "refund",
  "order",
  "charge",
  "merchant",
  "transaction",
  "factura",
  "recibo",
  "pago",
  "compra",
  "cobro",
  "suscripcion",
  "reembolso",
  "estado de cuenta",
];

export const FINANCE_GMAIL_QUERY =
  "(receipt OR invoice OR payment OR paid OR purchase OR subscription OR bill OR statement OR refund OR order OR factura OR recibo OR pago OR compra OR cobro OR suscripcion OR reembolso OR transaction)";

export const DEFAULT_FINANCE_ACCOUNT = {
  name: "Unassigned Finance Inbox",
  accountType: "cash",
  currency: "COP",
  institution: "Personal OS",
  icon: "📥",
};

export const PRIMARY_CASH_ACCOUNT = {
  name: "Bancolombia Available Cash",
  accountType: "cash",
  currency: "COP",
  institution: "Bancolombia",
  icon: "🏦",
} as const;

export const PRIMARY_CASH_BALANCE_SEED = 8_399_224;

export const CANONICAL_FUND_POCKETS = [
  {
    slug: "safety-net",
    name: "Safety Net",
    description: "Emergency buffer and resilience cash.",
    icon: "🛡️",
    color: "#22c55e",
    sortOrder: 1,
  },
  {
    slug: "fixed-costs-obligations",
    name: "Fixed Costs/Obligations",
    description: "Rent, utilities, subscriptions, and committed monthly bills.",
    icon: "🧾",
    color: "#3b82f6",
    sortOrder: 2,
  },
  {
    slug: "goals-and-planned-expenses",
    name: "Goals and Planned Expenses",
    description: "Planned purchases, travel, and medium-term goals.",
    icon: "🎯",
    color: "#f59e0b",
    sortOrder: 3,
  },
  {
    slug: "debt-minimum-payments",
    name: "Debt Minimum Payments",
    description: "Minimum required debt and card payments.",
    icon: "💳",
    color: "#ef4444",
    sortOrder: 4,
  },
  {
    slug: "fun-money",
    name: "Fun Money",
    description: "Lifestyle spending with permission and limits.",
    icon: "🎉",
    color: "#a855f7",
    sortOrder: 5,
  },
] as const;

export const TX_CATEGORY_TO_BUDGET_CATEGORY_NAME: Record<string, string> = {
  housing: "Housing",
  food: "Food & Groceries",
  dining_out: "Dining Out",
  transport: "Transport",
  utilities: "Utilities",
  entertainment: "Entertainment",
  health: "Health & Fitness",
  education: "Education",
  shopping: "Shopping",
  personal: "Personal Care",
  insurance: "Insurance",
  debt_payment: "Debt Payments",
  savings: "Savings",
  income: "Salary",
  other: "Other",
};

export const REVIEW_ACTIONS = [
  "confirm",
  "edit",
  "ignore",
  "dismiss",
  "duplicate",
  "refund",
  "split",
  "merge",
  "create_rule",
  "attach_password",
] as const;

export type ReviewAction = (typeof REVIEW_ACTIONS)[number];
