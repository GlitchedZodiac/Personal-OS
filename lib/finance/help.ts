export const FINANCE_HELP = {
  ignoreSource:
    "Ignore Source marks this sender as noise by default. Future documents still sync, but they stay out of budgets and spend totals unless you review them manually.",
  captureOnly:
    "Capture Only stores the emails, attachments, and extracted signals for review. Nothing from this source hits the ledger automatically.",
  biller:
    "Biller tells finance this sender usually sends statements, due dates, or bill notices. Those create upcoming payments instead of posted spend.",
  income:
    "Income marks this source as a likely payroll or payout sender. It helps categorize future confirmed deposits correctly.",
  trustAutoSettle:
    "Trust + Auto-settle trusts the source, but only settled charge-like emails should post. Mixed senders still need subject or subtype rules for promos, orders, and failed payments.",
  confirmPost:
    "Confirm & Post promotes this signal into the finance ledger right now using the extracted merchant, category, and COP-normalized amount.",
  learnRule:
    "Learn Rule creates a reusable pattern from the current signal so similar future emails can be ignored, treated as provisional orders, or auto-settled safely.",
  syncNow:
    "Sync Now pulls the newest Gmail activity without replacing your existing finance history.",
  fullRescan:
    "Full Re-scan re-reads the Gmail finance query and is best for source discovery, backfill checks, or after you improve the parser and rules.",
  provisional:
    "Provisional means the app found an order, notice, or pre-settlement event. It stays out of spend totals until a real charge or receipt settles it.",
  settled:
    "Settled means finance found a real paid charge or confirmed receipt, so this item can safely count in COP budgets and reports.",
  failed:
    "Failed or rejected means the app found a declined or unsuccessful payment. It should never count as spend unless you explicitly correct it.",
} as const;
