// ============================================================
//  controllers/upload.controller.js — Core Upload + AI Pipeline
//  UPDATED v2: persists to MongoDB, increments user counter
// ============================================================

import fs from "fs";
import { extractTextFromFile } from "../utils/fileParser.js";
import { analyzeTransactions } from "../utils/gemini.service.js";
import Statement from "../models/Statement.js";
import User from "../models/User.js";

export async function processFile(req, res, next) {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file received." });
  }
  const { path: filePath, mimetype, originalname } = req.file;
  console.log(`\n📁  Processing: ${originalname} for user ${req.user.email}`);
  try {
    const rawText = await extractTextFromFile(filePath, mimetype);
    const transactions = await analyzeTransactions(rawText);
    if (transactions.length === 0) {
      return res.status(422).json({ success: false, error: "No transactions found in this file." });
    }
    const summary = computeSummary(transactions);
    const recommendation = generateRecommendation(summary);

    // Persist to MongoDB
    const statement = await Statement.create({
      user: req.user._id,
      filename: originalname,
      transactions,
      summary,
      recommendation,
      periodStart: summary.monthlyTrends[0]?.rawMonth || null,
      periodEnd: summary.monthlyTrends[summary.monthlyTrends.length - 1]?.rawMonth || null,
    });

    // Increment user's personal counter
    await User.findByIdAndUpdate(req.user._id, { $inc: { statementsAnalysed: 1 } });

    console.log(`✅  Saved statement ${statement._id}`);
    res.status(200).json({
      success: true,
      statementId: statement._id,
      filename: originalname,
      transactions,
      summary,
      recommendation,
    });
  } catch (err) {
    next(err);
  } finally {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

export async function getStatementHistory(req, res, next) {
  try {
    const statements = await Statement.find({ user: req.user._id })
      .select("filename summary.totalIncome summary.totalExpenses summary.netProfit summary.profitMargin createdAt periodStart periodEnd")
      .sort({ createdAt: -1 });
    res.json({ success: true, statements });
  } catch (err) { next(err); }
}

export async function getStatement(req, res, next) {
  try {
    const statement = await Statement.findOne({ _id: req.params.id, user: req.user._id });
    if (!statement) return res.status(404).json({ success: false, error: "Statement not found." });
    res.json({ success: true, statement });
  } catch (err) { next(err); }
}

// ── Private Helpers ──────────────────────────────────────────

function computeSummary(transactions) {
  const totalIncome = transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const netProfit = totalIncome - totalExpenses;
  const profitMargin = totalIncome > 0 ? ((netProfit / totalIncome) * 100).toFixed(1) : "0.0";

  const monthlyMap = {};
  transactions.forEach(t => {
    const month = t.date ? t.date.slice(0, 7) : "Unknown";
    if (!monthlyMap[month]) monthlyMap[month] = { rawMonth: month, income: 0, expenses: 0 };
    if (t.type === "income") monthlyMap[month].income += t.amount;
    else monthlyMap[month].expenses += t.amount;
  });

  const monthlyTrends = Object.values(monthlyMap)
    .sort((a, b) => a.rawMonth.localeCompare(b.rawMonth))
    .map(m => ({
      month: formatMonthLabel(m.rawMonth),
      rawMonth: m.rawMonth,
      income: parseFloat(m.income.toFixed(2)),
      expenses: parseFloat(m.expenses.toFixed(2)),
      profit: parseFloat((m.income - m.expenses).toFixed(2)),
    }));

  const categoryMap = {};
  transactions.forEach(t => {
    if (!categoryMap[t.category]) categoryMap[t.category] = { category: t.category, type: t.type, total: 0 };
    categoryMap[t.category].total += t.amount;
  });

  const categoryBreakdown = Object.values(categoryMap)
    .sort((a, b) => b.total - a.total)
    .map(c => ({ ...c, total: parseFloat(c.total.toFixed(2)) }));

  return {
    totalIncome: parseFloat(totalIncome.toFixed(2)),
    totalExpenses: parseFloat(totalExpenses.toFixed(2)),
    netProfit: parseFloat(netProfit.toFixed(2)),
    profitMargin: parseFloat(profitMargin),
    transactionCount: transactions.length,
    monthlyTrends,
    categoryBreakdown,
  };
}

function generateRecommendation(summary) {
  const { profitMargin, totalExpenses, categoryBreakdown } = summary;
  let status, message;
  if (profitMargin >= 20) { status = "healthy"; message = `Your business is performing well with a ${profitMargin}% profit margin.`; }
  else if (profitMargin >= 5) { status = "warning"; message = `Your profit margin of ${profitMargin}% is positive but thin.`; }
  else { status = "critical"; message = `Your business is operating at a loss (${profitMargin}% margin). Urgent action required.`; }

  const tips = [];
  const topExpense = categoryBreakdown.filter(c => c.type === "expense").sort((a, b) => b.total - a.total)[0];
  if (topExpense) {
    const pct = ((topExpense.total / totalExpenses) * 100).toFixed(0);
    tips.push(`Your largest expense is "${topExpense.category}" at ${pct}% of total spend.`);
  }
  if (profitMargin < 15) tips.push("Target 20-30% net margins. Review expense ratios against industry benchmarks.");
  if (profitMargin > 30) tips.push("Strong margins — consider reinvesting surplus into growth or cash reserves.");
  tips.push("Review recurring subscriptions quarterly to eliminate unused services.");
  return { status, message, tips };
}

function formatMonthLabel(yearMonth) {
  if (!yearMonth || yearMonth === "Unknown") return "Unknown";
  const [year, month] = yearMonth.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(month, 10) - 1]} ${year}`;
}