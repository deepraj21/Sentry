import { initNavAuth } from "./auth-session.js";

const form = document.getElementById("analyze-form");
const statusEl = document.getElementById("status");
const submitButton = document.getElementById("submit-button");
const recentReportsEl = document.getElementById("recent-reports");
const defaultLabelEl = submitButton?.querySelector?.("[data-default-label]");
const loadingLabelEl = submitButton?.querySelector?.("[data-loading-label]");
const spinnerEl = submitButton?.querySelector?.(".spinner");

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.classList.remove("status-error", "status-success");
  if (type) {
    statusEl.classList.add(type);
  }
}

function setLoadingState(isLoading) {
  if (!submitButton) return;
  submitButton.disabled = Boolean(isLoading);

  if (defaultLabelEl) defaultLabelEl.hidden = Boolean(isLoading);
  if (loadingLabelEl) loadingLabelEl.hidden = !isLoading;
  if (spinnerEl) spinnerEl.hidden = !isLoading;

  // While loading, keep the status line minimal.
  if (isLoading) {
    setStatus("");
  }
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function verdictClass(verdict) {
  const normalized = String(verdict || "").toUpperCase();
  if (normalized === "APPROVE") return "verdict-approve";
  if (normalized === "REQUEST_CHANGES") return "verdict-request";
  return "verdict-discuss";
}

async function loadRecentReports() {
  if (!recentReportsEl) return;

  try {
    const response = await fetch("/api/reports");
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data?.error?.message || "Failed to load reports.");
    }

    const reports = data.reports || [];
    if (reports.length === 0) {
      recentReportsEl.innerHTML =
        '<article class="recent-card empty-card">No reports yet. Analyze a PR to create your first report.</article>';
      return;
    }

    recentReportsEl.innerHTML = reports
      .map((entry) => {
        const verdict = entry?.report?.verdict || "NEEDS_DISCUSSION";
        const title = entry?.pr?.title || "Untitled PR";
        const author = entry?.pr?.author || "unknown";
        const summary = entry?.report?.summary || "No summary available.";
        const when = entry?.metadata?.analyzedAt
          ? new Date(entry.metadata.analyzedAt).toLocaleString()
          : "Unknown time";

        return `<article class="recent-card">
          <div class="recent-top">
            <span class="badge ${verdictClass(verdict)}">${escapeHtml(verdict.replaceAll("_", " "))}</span>
            <span class="recent-time">${escapeHtml(when)}</span>
          </div>
          <h3 class="title-sm recent-title">${escapeHtml(title)}</h3>
          <p class="recent-meta">by @${escapeHtml(author)}</p>
          <p class="recent-summary">${escapeHtml(summary)}</p>
          <div class="recent-actions">
            ${
              entry.id
                ? `<a class="button button-secondary recent-link" href="/report?id=${escapeHtml(entry.id)}">View Report</a>`
                : ""
            }
            <a class="button button-secondary recent-link" href="${escapeHtml(entry.prUrl)}" target="_blank" rel="noopener noreferrer">Open PR</a>
          </div>
        </article>`;
      })
      .join("");
  } catch (err) {
    recentReportsEl.innerHTML = `<article class="recent-card empty-card">${escapeHtml(
      err?.message || "Failed to load recent reports."
    )}</article>`;
  }
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const prUrl = String(formData.get("prUrl") || "").trim();

  if (!prUrl) {
    setStatus("Please enter a pull request URL.", "status-error");
    return;
  }

  setLoadingState(true);

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prUrl })
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data?.error?.message || "Analyze request failed.");
    }

    localStorage.setItem("sentry:lastReport", JSON.stringify(data));
    setStatus("Report generated successfully. Redirecting...", "status-success");
    await loadRecentReports();
    if (data.reportId) {
      window.location.assign(`/report?id=${encodeURIComponent(data.reportId)}`);
    } else {
      window.location.assign("/report");
    }
  } catch (err) {
    setStatus(err.message || "Unexpected error while analyzing PR.", "status-error");
  } finally {
    setLoadingState(false);
  }
});

loadRecentReports();
initNavAuth();

if (window.location.hash === "#analyze-form") {
  form?.scrollIntoView({ behavior: "smooth", block: "center" });
  document.getElementById("prUrl")?.focus();
}
