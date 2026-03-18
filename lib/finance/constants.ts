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
