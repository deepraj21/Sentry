import {
  initNavAuth,
  requireAuth,
  authHeaders,
  escapeHtml
} from "./auth-session.js";
import { showAlert, showConfirm } from "./dialog.js";
import { BRAND_LOGO } from "./nav-icons.js";

const GITHUB_APP_INSTALL_URL = "https://github.com/apps/sentry-pr-review/installations/new";

const params = new URLSearchParams(window.location.search);
const projectId = params.get("id");

const projectTitle = document.getElementById("project-title");
const projectMeta = document.getElementById("project-meta");
const pullsWrap = document.getElementById("pulls-table-wrap");
const reportsEl = document.getElementById("project-reports");

let currentProject = null;

const installAppBtn = document.getElementById("install-github-app-btn");
const installAppLogo = installAppBtn?.querySelector(".install-app-logo");
const installedBadge = document.getElementById("github-app-installed-badge");

if (installAppLogo) {
  installAppLogo.innerHTML = BRAND_LOGO;
}

async function loadGitHubAppStatus() {
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

function updateGitHubAppInstallUI(status) {
  if (!installAppBtn || !installedBadge) return;

  const needsInstall = status?.configured && !status?.installed;
  const isInstalled = status?.configured && status?.installed;

  installAppBtn.hidden = !needsInstall;
  installedBadge.hidden = !isInstalled;

  if (needsInstall && status?.installUrl) {
    installAppBtn.href = status.installUrl;
  } else {
    installAppBtn.href = GITHUB_APP_INSTALL_URL;
  }
}

function pullsTableHead() {
  return `<thead>
    <tr>
      <th>#</th>
      <th>Title</th>
      <th>Author</th>
      <th>Updated</th>
      <th class="pulls-table-actions">
        <button type="button" id="refresh-pulls" class="button button-secondary">Refresh</button>
      </th>
    </tr>
  </thead>`;
}

function bindRefreshButton() {
  pullsWrap?.querySelector("#refresh-pulls")?.addEventListener("click", loadPulls);
}

function verdictClass(verdict) {
  const normalized = String(verdict || "").toUpperCase();
  if (normalized === "APPROVE") return "verdict-approve";
  if (normalized === "REQUEST_CHANGES") return "verdict-request";
  return "verdict-discuss";
}

async function loadProjectReports() {
  if (!reportsEl || !projectId) return;

  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/reports`, {
      headers: authHeaders()
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data?.error?.message || "Failed to load reviews.");
    }

    const reports = data.reports || [];
    if (reports.length === 0) {
      reportsEl.innerHTML =
        '<article class="recent-card empty-card">No reviews yet. Analyze an open PR above.</article>';
      return;
    }

    reportsEl.innerHTML = reports
      .map((entry) => {
        const verdict = entry?.report?.verdict || "NEEDS_DISCUSSION";
        const title = entry?.pr?.title || "Untitled PR";
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
          <p class="recent-summary">${escapeHtml(summary)}</p>
          <div class="recent-actions">
            <a class="button button-secondary recent-link" href="/report?id=${escapeHtml(entry.id)}">View Report</a>
            <button type="button" class="button button-danger delete-report-btn" data-report-id="${escapeHtml(entry.id)}">Delete</button>
          </div>
        </article>`;
      })
      .join("");

    reportsEl.querySelectorAll(".delete-report-btn").forEach((btn) => {
      btn.addEventListener("click", () => deleteReport(btn.dataset.reportId, btn));
    });
  } catch (err) {
    reportsEl.innerHTML = `<article class="recent-card empty-card">${escapeHtml(
      err?.message || "Failed to load reviews."
    )}</article>`;
  }
}

function renderPulls(pulls) {
  if (!pullsWrap) return;

  if (!Array.isArray(pulls) || pulls.length === 0) {
    pullsWrap.innerHTML = `<table class="pulls-table">
      ${pullsTableHead()}
      <tbody>
        <tr>
          <td colspan="5">No open pull requests found.</td>
        </tr>
      </tbody>
    </table>`;
    bindRefreshButton();
    return;
  }

  pullsWrap.innerHTML = `<table class="pulls-table">
    ${pullsTableHead()}
    <tbody>
      ${pulls
        .map(
          (pr) => `<tr>
            <td>${escapeHtml(pr.number)}</td>
            <td>${escapeHtml(pr.title)}${pr.draft ? ' <span class="badge">Draft</span>' : ""}</td>
            <td>@${escapeHtml(pr.author)}</td>
            <td>${escapeHtml(pr.updatedAt ? new Date(pr.updatedAt).toLocaleString() : "—")}</td>
            <td>
              <button type="button" class="button button-primary review-btn" data-pull="${escapeHtml(pr.number)}">
                Review
              </button>
            </td>
          </tr>`
        )
        .join("")}
    </tbody>
  </table>`;

  bindRefreshButton();
  pullsWrap.querySelectorAll(".review-btn").forEach((btn) => {
    btn.addEventListener("click", () => triggerReview(Number(btn.dataset.pull), btn));
  });
}

async function loadProject() {
  if (!projectId) {
    projectTitle.textContent = "Project not found";
    projectMeta.textContent = "Missing project id in URL.";
    return;
  }

  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
    headers: authHeaders()
  });
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data?.error?.message || "Failed to load project.");
  }

  currentProject = data.project;
  projectTitle.textContent = currentProject.fullName;
  projectMeta.textContent = `${currentProject.isPrivate ? "Private" : "Public"} repository · default branch ${currentProject.defaultBranch}`;

  const appStatus = await loadGitHubAppStatus();
  updateGitHubAppInstallUI(appStatus);
}

async function loadPulls() {
  if (!projectId) return;

  pullsWrap.innerHTML = `<table class="pulls-table">
    ${pullsTableHead()}
    <tbody>
      <tr>
        <td colspan="5">Loading pull requests...</td>
      </tr>
    </tbody>
  </table>`;
  bindRefreshButton();

  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/pulls`, {
      headers: authHeaders()
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data?.error?.message || "Failed to load pull requests.");
    }

    renderPulls(data.pulls || []);
  } catch (err) {
    pullsWrap.innerHTML = `<table class="pulls-table">
      ${pullsTableHead()}
      <tbody>
        <tr>
          <td colspan="5" class="status-error">${escapeHtml(err.message || "Failed to load PRs.")}</td>
        </tr>
      </tbody>
    </table>`;
    bindRefreshButton();
  }
}

async function triggerReview(pullNumber, button) {
  if (!projectId || !pullNumber) return;

  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Analyzing...";

  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        pullNumber,
        visibility: "private",
        postComment: false
      })
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data?.error?.message || "Review failed.");
    }

    localStorage.setItem("sentry:lastReport", JSON.stringify(data));

    if (data.reportId) {
      window.location.assign(`/report?id=${encodeURIComponent(data.reportId)}`);
      return;
    }

    window.location.assign("/report");
  } catch (err) {
    await showAlert(err.message || "Review failed.");
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

async function deleteReport(reportId, button) {
  if (!projectId || !reportId) return;

  const confirmed = await showConfirm(
    "Delete this review? This action cannot be undone.",
    { confirmLabel: "Delete", danger: true }
  );
  if (!confirmed) return;

  const originalLabel = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = "Deleting...";
  }

  try {
    const response = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/reports/${encodeURIComponent(reportId)}`,
      { method: "DELETE", headers: authHeaders() }
    );
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data?.error?.message || "Failed to delete review.");
    }

    await loadProjectReports();
  } catch (err) {
    await showAlert(err.message || "Failed to delete review.");
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel || "Delete";
    }
  }
}

async function deleteCurrentProject() {
  if (!projectId || !currentProject) return;

  const label = currentProject.fullName || "this project";
  const confirmed = await showConfirm(
    `Delete ${label}? This will permanently remove the project and all related reviews.`,
    { confirmLabel: "Delete", danger: true }
  );
  if (!confirmed) {
    return;
  }

  const deleteBtn = document.getElementById("delete-project");
  if (deleteBtn) deleteBtn.disabled = true;

  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: "DELETE",
      headers: authHeaders()
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data?.error?.message || "Failed to delete project.");
    }

    window.location.assign("/projects");
  } catch (err) {
    await showAlert(err.message || "Failed to delete project.");
    if (deleteBtn) deleteBtn.disabled = false;
  }
}

const authed = await requireAuth();
if (authed && projectId) {
  await initNavAuth();
  document.getElementById("delete-project")?.addEventListener("click", deleteCurrentProject);
  try {
    await loadProject();
    await loadPulls();
    await loadProjectReports();
  } catch (err) {
    projectTitle.textContent = "Error";
    projectMeta.textContent = err.message || "Could not load project.";
  }
} else if (authed) {
  window.location.replace("/projects");
}
