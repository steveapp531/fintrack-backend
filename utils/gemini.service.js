// ============================================================
//  utils/gemini.service.js — Google Gemini AI Integration v3
//
//  ENHANCED: Handles large files via chunking + detailed match docs
//
//  WHY: Isolating all AI logic here means:
//   1. The controller stays clean — it just calls analyzeTransactions()
//   2. You can swap Gemini for another LLM by editing one file
//   3. The strict system prompt lives here, versioned with the code
//   4. Chunking logic for large files (full year statements) is centralized
//
//  FLOW: raw bank statement text → split into chunks if needed →
//        Gemini Flash → parsed JSON array → deduplicate → return
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
 * array of categorised transactions. Handles large files via chunking.
 *
 * For large files (full year statements), the text is chunked into
 * smaller segments to avoid timeouts and API limits. Each chunk is
 * processed independently, then deduplicated.
 *
 * @param {string} rawText — extracted text from PDF or CSV
 * @returns {Promise<Array>} — array of transaction objects with deduplication
 */
export async function analyzeTransactions(rawText) {
  // Guard: if the text is empty there is nothing to analyse
  if (!rawText || rawText.trim().length === 0) {
    throw new Error("No readable text found in the uploaded file.");
  }

  console.log(`\n📊  Analyzing ${(rawText.length / 1024).toFixed(2)} KB of statement data...`);
  const startTime = Date.now();

  // Split large statements into chunks to avoid timeouts
  const chunks = chunkText(rawText, 50000); // ~50KB per chunk
  console.log(`📦  Processing in ${chunks.length} chunk(s)...`);

  let allTransactions = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunkNum = i + 1;
    console.log(`   ⏳  Chunk ${chunkNum}/${chunks.length}...`);
    
    try {
      const chunkTransactions = await processChunk(chunks[i]);
      allTransactions = allTransactions.concat(chunkTransactions);
      console.log(`   ✅  Chunk ${chunkNum}: ${chunkTransactions.length} transactions extracted`);
    } catch (err) {
      console.error(`   ❌  Chunk ${chunkNum} failed:`, err.message);
      throw new Error(`Failed to process chunk ${chunkNum}/${chunks.length}: ${err.message}`);
    }
  }

  // Deduplicate transactions (in case same transaction appears in overlapping chunks)
  const uniqueTransactions = deduplicateTransactions(allTransactions);
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n✨  Analysis complete: ${uniqueTransactions.length} transactions in ${duration}s`);
  if (allTransactions.length > uniqueTransactions.length) {
    console.log(`   📈  Deduplication: Removed ${allTransactions.length - uniqueTransactions.length} duplicate entries`);
  }

  return uniqueTransactions;
}

/**
 * Process a single chunk of text through Gemini
 * @private
 */
async function processChunk(chunkText) {
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: SYSTEM_PROMPT,
  });

  const userPrompt = `
Extract and categorize all transactions from the following bank statement text.
Return ONLY the JSON array. Nothing else.

BANK STATEMENT TEXT:
---
${chunkText}
---
`;

  const result = await model.generateContent(userPrompt);
  const responseText = result.response.text();

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

/**
 * Split text into chunks while preserving line integrity.
 * Avoids breaking in the middle of a transaction line.
 * @private
 */
function chunkText(text, maxChunkSize = 50000) {
  if (text.length <= maxChunkSize) {
    return [text];
  }

  const lines = text.split("\n");
  const chunks = [];
  let currentChunk = "";

  for (const line of lines) {
    // If adding this line would exceed the limit, save current chunk and start new one
    if (currentChunk.length + line.length + 1 > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = line + "\n";
    } else {
      currentChunk += line + "\n";
    }
  }

  // Add the last chunk if it has content
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks.length === 0 ? [text] : chunks;
}

/**
 * Remove duplicate transactions from array.
 * Duplicates are identified by matching: date + description + amount + type
 * This is important when processing large files in chunks.
 * @private
 */
function deduplicateTransactions(transactions) {
  const seen = new Set();
  const unique = [];

  for (const transaction of transactions) {
    // Create a unique key based on transaction details
    const key = `${transaction.date}|${transaction.description}|${transaction.amount}|${transaction.type}`;
    
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(transaction);
    }
  }

  return unique;
}