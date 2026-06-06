/**
 * Build the public URL for a saved report.
 * @param {string} reportId
 * @returns {string | undefined}
 */
export function buildReportUrl(reportId) {
  const base = String(process.env.APP_URL || "").trim().replace(/\/$/, "");
  if (!base || !reportId) return undefined;
  return `${base}/report?id=${encodeURIComponent(reportId)}`;
}
