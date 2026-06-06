import { initNavAuth, authHeaders, getStoredUser, getStoredToken, validateSession } from "./auth-session.js";
import { showAlert, showConfirm } from "./dialog.js";

const GITHUB_APP_INSTALL_URL = "https://github.com/apps/sentry-pr-review/installations/new";

function byId(id) {
  return document.getElementById(id);
}

function setList(el, items) {
  if (!el) return;
  el.innerHTML = "";

  if (!Array.isArray(items) || items.length === 0) {
    const li = document.createElement("li");
    li.textContent = "None";
    el.appendChild(li);
    return;
  }

  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = String(item);
    el.appendChild(li);
  }
}

function renderRisks(report) {
  const risksEl = byId("risks");
  if (!risksEl) return;
  risksEl.innerHTML = "";

  const risks = report?.risks || [];
  if (!Array.isArray(risks) || risks.length === 0) {
    risksEl.textContent = "No major risks identified.";
    return;
  }

  for (const risk of risks) {
    const card = document.createElement("article");
    card.className = "risk-item";
    const severity = String(risk?.severity || "minor").toLowerCase();
    card.innerHTML = `
      <p class="risk-severity-${severity}"><strong>${severity.toUpperCase()}</strong></p>
      <p><strong>File:</strong> ${risk?.file || "-"}</p>
      <p><strong>Line:</strong> ${risk?.line ?? "-"}</p>
      <p><strong>Issue:</strong> ${risk?.description || "-"}</p>
      <p><strong>Suggestion:</strong> ${risk?.suggestion || "-"}</p>
    `;
    risksEl.appendChild(card);
  }
}

let currentReportId = null;
let currentReportData = null;

function getGitHubPrUrl(data) {
  if (data?.prUrl) return data.prUrl;
  if (data?.pr?.url) return data.pr.url;
  const { owner, repo, pullNumber } = data || {};
  if (owner && repo && pullNumber) {
    return `https://github.com/${owner}/${repo}/pull/${pullNumber}`;
  }
  return null;
}

function setInstallPromptVisible(visible, installUrl = GITHUB_APP_INSTALL_URL) {
  const installEl = byId("github-app-install");
  const installBtn = byId("install-github-app-btn");
  if (!installEl) return;

  installEl.hidden = !visible;
  if (installBtn && installUrl) {
    installBtn.href = installUrl;
  }
}

async function loadGitHubAppStatus(projectId) {
  if (!projectId) return null;

  try {
    const response = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/github-app`,
      { headers: authHeaders() }
    );
    const data = await response.json();
    if (!response.ok || !data.success) return null;
    return data;
  } catch {
    return null;
  }
}

async function renderReportData(data) {
  currentReportData = data;
  const report = data.report || {};
  const metadata = data.metadata || {};
  const pr = data.pr || {};

  byId("report-title").textContent = pr.title || "Untitled PR";
  byId("report-summary").textContent = report.summary || "No summary available.";
  byId("verdict").textContent = report.verdict || "-";
  byId("confidence").textContent =
    typeof report.confidence === "number" ? report.confidence.toFixed(2) : "-";
  byId("model").textContent = metadata.model || "-";
  byId("analyzed-at").textContent = metadata.analyzedAt || "-";
  byId("merge-ready").textContent =
    report?.mergeReadiness?.ready === true ? "Yes" : "No";

  renderRisks(report);
  setList(byId("strengths"), report.strengths);
  setList(byId("missing-tests"), report.missingTests);
  setList(byId("security"), report.securityConcerns);
  setList(byId("performance"), report.performanceNotes);
  setList(byId("blockers"), report?.mergeReadiness?.blockers);
  setList(byId("suggestions"), report?.mergeReadiness?.suggestions);

  let appStatus = null;
  const user = getStoredUser();
  if (data.projectId && user?.id && data.userId === user.id) {
    appStatus = await loadGitHubAppStatus(data.projectId);
  }

  updateCommentActions(data, appStatus);
  await loadCommentPreview(data);
}

async function loadCommentPreview(data) {
  const sectionEl = byId("comment-preview-section");
  const bodyEl = byId("comment-preview-body");
  const toggleBtn = byId("toggle-comment-preview");
  const reportId = data?.id || data?.reportId || currentReportId;

  if (!sectionEl || !bodyEl || !reportId) {
    if (sectionEl) sectionEl.hidden = true;
    return;
  }

  sectionEl.hidden = false;
  bodyEl.hidden = true;
  if (toggleBtn) {
    toggleBtn.textContent = "Show preview";
  }

  try {
    const response = await fetch(
      `/api/reports/${encodeURIComponent(reportId)}/comment-preview`,
      { headers: authHeaders() }
    );
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      sectionEl.hidden = true;
      return;
    }
    bodyEl.textContent = payload.body || "";
  } catch {
    sectionEl.hidden = true;
  }
}

function updateCommentActions(data, appStatus = null) {
  const actionsEl = byId("report-actions");
  const postBtn = byId("post-comment-btn");
  const deleteBtn = byId("delete-report-btn");
  const linkEl = byId("github-comment-link");
  const statusEl = byId("comment-status");
  const statusBadge = byId("comment-status-badge");
  const user = getStoredUser();
  const prUrl = getGitHubPrUrl(data);

  if (!actionsEl) return;

  const isOwner = Boolean(user?.id && data.userId === user.id);
  const hasProject = Boolean(data.projectId);

  if (!isOwner || !hasProject) {
    actionsEl.hidden = true;
    setInstallPromptVisible(false);
    return;
  }

  actionsEl.hidden = false;
  if (deleteBtn) deleteBtn.hidden = false;

  const needsInstall = appStatus?.configured && !appStatus?.installed;
  setInstallPromptVisible(needsInstall, appStatus?.installUrl || GITHUB_APP_INSTALL_URL);

  if (prUrl && linkEl) {
    linkEl.href = prUrl;
    linkEl.hidden = false;
  } else if (linkEl) {
    linkEl.hidden = true;
    linkEl.removeAttribute("href");
  }

  if (data.githubCommentUrl) {
    setInstallPromptVisible(false);
    postBtn.hidden = true;
    if (statusBadge) statusBadge.hidden = false;
    if (statusEl) {
      statusEl.textContent = "";
      statusEl.classList.remove("status-error", "status-success");
    }
    return;
  }

  postBtn.hidden = false;
  if (statusBadge) statusBadge.hidden = true;
  if (statusEl) {
    statusEl.textContent = "";
    statusEl.classList.remove("status-error", "status-success");
  }
}

function showEmptyState(message) {
  byId("report-title").textContent = "No report loaded";
  byId("report-summary").textContent = message;
}

function loadLocalReport(reportId) {
  const raw = localStorage.getItem("sentry:lastReport");
  if (!raw) return null;

  try {
    const data = JSON.parse(raw);
    if (reportId && data.reportId && data.reportId !== reportId) {
      return null;
    }
    if (reportId && !data.id) {
      data.id = data.reportId;
    }
    if (!data.prUrl && data.pr?.url) {
      data.prUrl = data.pr.url;
    }
    return data;
  } catch {
    return null;
  }
}

async function loadReportFromApi(id) {
  const response = await fetch(`/api/reports/${encodeURIComponent(id)}`, {
    headers: authHeaders()
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    const message = data?.error?.message || "Failed to load report.";
    if (response.status === 403 && !getStoredToken()) {
      throw new Error("Sign in to view this private report.");
    }
    throw new Error(message);
  }
  return data;
}

async function postComment(reportId) {
  const postBtn = byId("post-comment-btn");
  const statusEl = byId("comment-status");
  const statusBadge = byId("comment-status-badge");

  const confirmed = await showConfirm(
    "Post this review as a comment on the GitHub pull request?",
    { confirmLabel: "Post Comment" }
  );
  if (!confirmed) {
    return;
  }

  postBtn.disabled = true;
  if (statusBadge) statusBadge.hidden = true;
  if (statusEl) {
    statusEl.textContent = "Posting comment to GitHub...";
    statusEl.classList.remove("status-error", "status-success");
  }

  try {
    const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/comment`, {
      method: "POST",
      headers: authHeaders()
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      const err = new Error(data?.error?.message || "Failed to post comment.");
      err.installUrl = data?.error?.installUrl;
      err.code = data?.error?.code;
      throw err;
    }

    if (statusEl) {
      statusEl.textContent = "";
      statusEl.classList.remove("status-error", "status-success");
    }
    if (statusBadge) statusBadge.hidden = false;
    postBtn.hidden = true;
    setInstallPromptVisible(false);

    const linkEl = byId("github-comment-link");
    const prUrl = getGitHubPrUrl(currentReportData);
    if (linkEl && prUrl) {
      linkEl.href = prUrl;
      linkEl.hidden = false;
    }

    if (currentReportData && data.commentUrl) {
      currentReportData.githubCommentUrl = data.commentUrl;
    }
  } catch (err) {
    if (statusBadge) statusBadge.hidden = true;
    const installUrl = err.installUrl || GITHUB_APP_INSTALL_URL;
    const showInstall =
      err.code === "REPO_ACCESS_DENIED" ||
      /install/i.test(String(err.message || ""));

    if (showInstall) {
      setInstallPromptVisible(true, installUrl);
      if (statusEl) {
        statusEl.textContent =
          "Install the GitHub App on this repository, then click Post Comment again.";
        statusEl.classList.add("status-error");
      }
    } else if (statusEl) {
      statusEl.textContent = err.message || "Failed to post comment.";
      statusEl.classList.add("status-error");
    }
    postBtn.disabled = false;
  }
}

byId("post-comment-btn")?.addEventListener("click", () => {
  if (currentReportId) postComment(currentReportId);
});

byId("toggle-comment-preview")?.addEventListener("click", () => {
  const bodyEl = byId("comment-preview-body");
  const toggleBtn = byId("toggle-comment-preview");
  if (!bodyEl || !toggleBtn) return;

  const showing = !bodyEl.hidden;
  bodyEl.hidden = showing;
  toggleBtn.textContent = showing ? "Show preview" : "Hide preview";
});

async function deleteCurrentReport() {
  if (!currentReportId || !currentReportData?.projectId) return;

  const confirmed = await showConfirm(
    "Delete this review? This action cannot be undone.",
    { confirmLabel: "Delete", danger: true }
  );
  if (!confirmed) return;

  const deleteBtn = byId("delete-report-btn");
  if (deleteBtn) {
    deleteBtn.disabled = true;
    deleteBtn.textContent = "Deleting...";
  }

  try {
    const projectId = currentReportData.projectId;
    const response = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/reports/${encodeURIComponent(currentReportId)}`,
      { method: "DELETE", headers: authHeaders() }
    );
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data?.error?.message || "Failed to delete review.");
    }

    window.location.assign(`/project?id=${encodeURIComponent(projectId)}`);
  } catch (err) {
    await showAlert(err.message || "Failed to delete review.");
    if (deleteBtn) {
      deleteBtn.disabled = false;
      deleteBtn.textContent = "Delete Review";
    }
  }
}

byId("delete-report-btn")?.addEventListener("click", deleteCurrentReport);

async function render() {
  const params = new URLSearchParams(window.location.search);
  const reportId = params.get("id");
  currentReportId = reportId;

  if (reportId) {
    try {
      const data = await loadReportFromApi(reportId);
      await renderReportData(data);
      return;
    } catch (err) {
      const fallback = loadLocalReport(reportId);
      if (fallback) {
        await renderReportData(fallback);
        return;
      }
      showEmptyState(err?.message || "Could not load this report.");
      return;
    }
  }

  const fallback = loadLocalReport();
  if (fallback) {
    await renderReportData(fallback);
    return;
  }

  showEmptyState("Run an analysis first from the home page or a project.");
}

await validateSession();
await render();
await initNavAuth();
