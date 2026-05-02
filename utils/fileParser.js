// ============================================================
//  utils/fileParser.js — PDF & CSV Text Extraction
//
//  WHY: Before we can send bank statement content to the AI,
//  we need raw text. This module handles both supported formats
//  and returns a uniform string that the Gemini service can
//  consume — the controller never has to think about file types.
// ============================================================

import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import { parse as csvParse } from "csv-parse/sync";

/**
 * Extracts all readable text from a bank statement file.
 * Supports .pdf and .csv (also plain .txt).
 *
 * @param {string} filePath — absolute path to the uploaded file
 * @param {string} mimetype — MIME type reported by multer
 * @returns {Promise<string>} — raw text content ready for AI
 */
export async function extractTextFromFile(filePath, mimetype) {
  const ext = path.extname(filePath).toLowerCase();

  // ── PDF Extraction ────────────────────────────────────────
  if (ext === ".pdf" || mimetype === "application/pdf") {
    return await extractFromPDF(filePath);
  }

  // ── CSV / TXT Extraction ──────────────────────────────────
  if (ext === ".csv" || ext === ".txt" || mimetype === "text/csv") {
    return await extractFromCSV(filePath);
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

// ─────────────────────────────────────────────────────────────
//  PRIVATE HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Reads a PDF buffer and extracts its text layer.
 * pdf-parse works best with text-based PDFs (not scanned images).
 */
async function extractFromPDF(filePath) {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);

  if (!data.text || data.text.trim().length < 10) {
    throw new Error(
      "Could not extract text from this PDF. " +
        "It may be a scanned image. Please use a text-based bank statement PDF."
    );
  }

  console.log(`📄  PDF extracted: ${data.text.length} characters from ${data.numpages} page(s)`);
  return data.text;
}

/**
 * Reads a CSV file and converts each row to a readable text line.
 * We stringify the records so Gemini can parse them like natural text.
 * e.g. "2024-03-01 | Stripe Payment | 1500.00 | Credit"
 */
async function extractFromCSV(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");

  // csv-parse/sync is synchronous — simpler for our use case
  let records;
  try {
    records = csvParse(raw, {
      columns: true,          // Use first row as header names
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true, // Handle messy bank CSVs gracefully
    });
  } catch {
    // Fallback: treat as plain text if CSV parsing fails
    console.warn("⚠️  CSV parse failed, falling back to raw text.");
    return raw;
  }

  if (records.length === 0) {
    throw new Error("The CSV file appears to be empty.");
  }

  // Convert each record object to a human-readable line of text
  // This is what Gemini will receive — clear and unambiguous
  const lines = records.map((row) =>
    Object.entries(row)
      .map(([key, val]) => `${key}: ${val}`)
      .join(" | ")
  );

  console.log(`📊  CSV extracted: ${records.length} rows`);
  return lines.join("\n");
}