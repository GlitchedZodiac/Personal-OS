import { openai } from "@/lib/openai";
import {
  capDemoCompletionTokens,
  enforceDemoAIBudget,
  getDemoChatModel,
  recordDemoAISpend,
} from "@/lib/demo-ai-budget";

interface ParsedFinanceText {
  description: string;
  amount: number | null;
  currency: string;
  merchant: string | null;
  category: string;
  subcategory: string | null;
  type: "income" | "expense" | "transfer";
  transactedAt: string | null;
  taxAmount: number | null;
  tipAmount: number | null;
  deductible: boolean;
  notes: string | null;
  confidence: number;
  message: string;
}

interface ParsedReceipt extends ParsedFinanceText {
  subtotalAmount: number | null;
}

const FINANCE_TEXT_SYSTEM_PROMPT = `You are a finance extraction assistant inside a personal operating system app.

Extract a single finance event from a user's free-form note or voice transcription.

Return JSON with:
- description
- amount
- currency
- merchant
- category
- subcategory
- type
- transactedAt
- taxAmount
- tipAmount
- deductible
- notes
- confidence
- message

Rules:
- Use COP unless the user clearly says another currency.
- Expenses should be returned as positive amounts; the app will normalize the sign.
- Keep categories in this set: food, dining_out, transport, housing, utilities, entertainment, health, education, shopping, personal, insurance, debt_payment, savings, income, transfer, other.
- Confidence is 0 to 1.
- If the amount is unclear, use null and lower confidence.
- Respond with valid JSON only.`;

const FINANCE_RECEIPT_SYSTEM_PROMPT = `You are a receipt parser for a personal finance app.

Extract a single transaction from this receipt image.

Return JSON with:
- description
- amount
- subtotalAmount
- currency
- merchant
- category
- subcategory
- type
- transactedAt
- taxAmount
- tipAmount
- deductible
- notes
- confidence
- message

Rules:
- Expenses should be positive amounts in the JSON.
- If a subtotal/tax/tip is not visible, use null.
- Use COP unless clearly another currency.
- Keep categories in this set: food, dining_out, transport, housing, utilities, entertainment, health, education, shopping, personal, insurance, debt_payment, savings, income, transfer, other.
- Respond with valid JSON only.`;

async function parseJSONResponse<T>(content: string): Promise<T> {
  const sanitized = content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(sanitized) as T;
}

export async function analyzeFinanceText(message: string, aiLanguage = "english") {
  const blocked = await enforceDemoAIBudget();
  if (blocked) return blocked;

  const response = await openai.chat.completions.create({
    model: getDemoChatModel("gpt-5.2"),
    response_format: { type: "json_object" },
    max_completion_tokens: capDemoCompletionTokens(800),
    messages: [
      { role: "system", content: `${FINANCE_TEXT_SYSTEM_PROMPT}\nReturn the short user-facing message in ${aiLanguage}.` },
      { role: "user", content: message },
    ],
  });
  await recordDemoAISpend(response.usage);

  return parseJSONResponse<ParsedFinanceText>(response.choices[0].message.content || "{}");
}

export async function analyzeFinanceReceipt(image: string, aiLanguage = "english") {
  const blocked = await enforceDemoAIBudget();
  if (blocked) return blocked;

  const response = await openai.chat.completions.create({
    model: getDemoChatModel("gpt-5.2"),
    response_format: { type: "json_object" },
    max_completion_tokens: capDemoCompletionTokens(1000),
    messages: [
      { role: "system", content: `${FINANCE_RECEIPT_SYSTEM_PROMPT}\nReturn the short user-facing message in ${aiLanguage}.` },
      {
        role: "user",
        content: [
          { type: "text", text: "Analyze this receipt image and extract the transaction." },
          {
            type: "image_url",
            image_url: {
              url: image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`,
              detail: "high",
            },
          },
        ],
      },
    ],
  });
  await recordDemoAISpend(response.usage);

  return parseJSONResponse<ParsedReceipt>(response.choices[0].message.content || "{}");
}
