// ============================================================
//  utils/gemini.service.js — Google Gemini AI Integration
//
//  WHY: Isolating all AI logic here means:
//   1. The controller stays clean — it just calls analyzeTransactions()
//   2. You can swap Gemini for another LLM by editing one file
//   3. The strict system prompt lives here, versioned with the code
//
//  FLOW: raw bank statement text → Gemini Flash → parsed JSON array
// ============================================================

import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

// Initialise the Gemini client with the API key from .env
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
console.log("🤖  Gemini model configured:", GEMINI_MODEL);

// ── System Prompt ───────────────────────────────────────────
// This is the single most important piece of the AI pipeline.
// It is strict, deterministic, and machine-readable by design:
//   • No prose — only a JSON array is acceptable output
//   • Every field is typed and described
//   • Categories are enumerated so the model cannot hallucinate new ones
//   • "amount" is always a positive number — sign is captured by "type"
const SYSTEM_PROMPT = `
You are a highly accurate financial data extraction and categorization engine.

Your ONLY job is to read raw bank statement text and return a valid JSON array of transactions.

STRICT RULES:
1. Output ONLY a raw JSON array. No markdown, no code fences, no explanation, no preamble.
2. Every transaction must have exactly these fields:
   - "date"        : string — ISO 8601 format (YYYY-MM-DD). Infer the year if missing.
   - "description" : string — cleaned merchant/payee name, max 60 chars.
   - "amount"      : number — ALWAYS positive. The sign is determined by "type".
   - "type"        : string — MUST be exactly "income" or "expense".
   - "category"    : string — MUST be one of the allowed categories below.
3. Allowed categories:
   INCOME categories : "Sales Revenue", "Service Income", "Investment Returns",
                       "Loan Received", "Refund Received", "Other Income"
   EXPENSE categories: "Payroll", "Rent & Utilities", "Software & Subscriptions",
                       "Marketing & Advertising", "Travel & Transport",
                       "Office Supplies", "Bank Charges & Fees",
                       "Tax & Government", "Insurance", "Inventory & COGS",
                       "Professional Services", "Other Expense"
4. If a line is not a transaction (e.g. opening balance, statement header), skip it.
5. If a date cannot be determined, use the closest inferrable date.
6. Never invent amounts. Use exactly what is in the text.

Example of valid output:
[
  {"date":"2024-03-01","description":"Payroll Run","amount":12500.00,"type":"expense","category":"Payroll"},
  {"date":"2024-03-02","description":"Client Invoice #1042","amount":8750.00,"type":"income","category":"Sales Revenue"}
]
`;

/**
 * Sends raw bank statement text to Gemini and returns a structured
 * array of categorised transactions.
 *
 * @param {string} rawText — extracted text from PDF or CSV
 * @returns {Promise<Array>} — array of transaction objects
 */
export async function analyzeTransactions(rawText) {
  // Guard: if the text is empty there is nothing to analyse
  if (!rawText || rawText.trim().length === 0) {
    throw new Error("No readable text found in the uploaded file.");
  }

  // Use a supported Gemini model from the installed SDK
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    // System instruction sets the persistent context/role for the model
    systemInstruction: SYSTEM_PROMPT,
  });

  // Build the user-turn prompt — we append the raw text to analyse
  const userPrompt = `
Extract and categorize all transactions from the following bank statement text.
Return ONLY the JSON array. Nothing else.

BANK STATEMENT TEXT:
---
${rawText}
---
`;

  console.log("🤖  Sending text to Gemini AI for analysis...");

  const result = await model.generateContent(userPrompt);
  const responseText = result.response.text();

  console.log("✅  Gemini responded. Parsing JSON...");

  // ── Parse Response ────────────────────────────────────────
  // Strip any accidental markdown code fences the model may add
  const cleaned = responseText
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  let transactions;
  try {
    transactions = JSON.parse(cleaned);
  } catch {
    console.error("Raw Gemini response:", responseText);
    throw new Error(
      "Gemini returned an unparseable response. Try a cleaner bank statement."
    );
  }

  // ── Validate Shape ────────────────────────────────────────
  // Basic sanity check — ensure we got an array, not an object
  if (!Array.isArray(transactions)) {
    throw new Error("Gemini response was not a JSON array as expected.");
  }

  // Coerce amount to number just in case Gemini returns a string
  return transactions.map((t) => ({
    ...t,
    amount: parseFloat(t.amount) || 0,
  }));
}