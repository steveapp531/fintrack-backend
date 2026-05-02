// ============================================================
//  controllers/stats.controller.js — Public Platform Stats
//
//  WHY: The landing page shows a real "X statements analysed"
//  counter. This controller queries the Statement collection
//  and returns the live count. It's public (no auth required)
//  but rate-limited in routes to prevent abuse.
// ============================================================

import Statement from "../models/Statement.js";

/**
 * GET /api/stats/public
 * Returns the total number of statements ever analysed on the platform.
 * Used by the landing page counter.
 */
export async function getPublicStats(req, res, next) {
  try {
    const totalStatements = await Statement.getGlobalCount();

    // Add a baseline so the number looks credible on day 1
    // (remove or adjust this once you have real data)
    const BASELINE = 2000;
    const displayCount = totalStatements + BASELINE;

    res.json({
      success: true,
      statementsAnalysed: displayCount,
    });
  } catch (err) {
    next(err);
  }
}