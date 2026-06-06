import {
  initNavAuth,
  requireAuth,
  authHeaders,
  escapeHtml
} from "./auth-session.js";
import { showAlert, showConfirm } from "./dialog.js";

const projectsGrid = document.getElementById("projects-grid");
const searchInput = document.getElementById("project-search");
const modal = document.getElementById("add-project-modal");
const openAddBtn = document.getElementById("open-add-project");
const addForm = document.getElementById("add-project-form");
const verifyBtn = document.getElementById("verify-repo-btn");
const addBtn = document.getElementById("add-repo-btn");
const tokenSection = document.getElementById("token-section");
const verifyResult = document.getElementById("verify-result");
const statusEl = document.getElementById("add-project-status");

let verifiedRepo = null;
let searchTimer = null;

function setStatus(message, type = "") {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.remove("status-error", "status-success");
  if (type) statusEl.classList.add(type);
}

function resetModal() {
  verifiedRepo = null;
  addBtn.disabled = true;
  verifyResult.hidden = true;
  verifyResult.innerHTML = "";
  tokenSection.hidden = true;
  setStatus("");
  addForm?.reset();
}

function openModal() {
  resetModal();
  modal.hidden = false;
}

function closeModal() {
  modal.hidden = true;
  resetModal();
}

openAddBtn?.addEventListener("click", openModal);
modal?.querySelectorAll("[data-close-modal]").forEach((el) => {
  el.addEventListener("click", closeModal);
});

function folderPlusIcon(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`;
}

function renderProjectsEmptyState(isSearch) {
  if (isSearch) {
    return `<div class="projects-empty">
      <p class="projects-empty-text">No projects match your search.</p>
    </div>`;
  }

  return `<div class="projects-empty">
    <div class="projects-empty-icon">${folderPlusIcon(32)}</div>
    <h2 class="projects-empty-title">No Projects Yet</h2>
    <p class="projects-empty-text">You haven't created any projects yet.<br />Get started by creating your first project.</p>
    <button type="button" class="button button-primary projects-empty-create" data-open-add-project>
      ${folderPlusIcon(16)}
      <span>Create Project</span>
    </button>
  </div>`;
}

function bindEmptyStateActions() {
  projectsGrid?.querySelector("[data-open-add-project]")?.addEventListener("click", openModal);
}

function setProjectsGridMode(mode) {
  if (!projectsGrid) return;
  projectsGrid.classList.toggle("projects-grid--empty", mode === "empty");
  projectsGrid.classList.toggle("projects-grid--loading", mode === "loading");
  projectsGrid.classList.toggle("projects-grid--search-empty", mode === "search-empty");
}

async function loadProjects(query = "") {
  if (!projectsGrid) return;

  setProjectsGridMode("loading");
  projectsGrid.innerHTML = '<p class="projects-empty-loading body-md">Loading projects...</p>';

  try {
    const params = query ? `?q=${encodeURIComponent(query)}` : "";
    const response = await fetch(`/api/projects${params}`, {
      headers: authHeaders()
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data?.error?.message || "Failed to load projects.");
    }

    const projects = data.projects || [];
    const isSearch = Boolean(query.trim());

    if (projects.length === 0) {
      setProjectsGridMode(isSearch ? "search-empty" : "empty");
      projectsGrid.innerHTML = renderProjectsEmptyState(isSearch);
      bindEmptyStateActions();
      return;
    }

    setProjectsGridMode("grid");
    projectsGrid.innerHTML = projects
      .map(
        (project) => `<article class="project-card card">
          <div class="project-card-top">
            <h3 class="title-sm project-card-name">${escapeHtml(project.fullName)}</h3>
            ${project.isPrivate ? '<span class="badge">Private</span>' : '<span class="badge">Public</span>'}
          </div>
          <p class="recent-meta">Default branch: ${escapeHtml(project.defaultBranch || "main")}</p>
          <p class="recent-meta">Connected ${escapeHtml(project.createdAt ? new Date(project.createdAt).toLocaleDateString() : "recently")}</p>
          <div class="project-card-actions">
            <a class="button button-secondary" href="/project?id=${escapeHtml(project.id)}">Open PRs</a>
            <button type="button" class="button button-danger delete-project-btn" data-project-id="${escapeHtml(project.id)}" data-project-name="${escapeHtml(project.fullName)}">Delete</button>
          </div>
        </article>`
      )
      .join("");

    projectsGrid.querySelectorAll(".delete-project-btn").forEach((btn) => {
      btn.addEventListener("click", () =>
        deleteProject(btn.dataset.projectId, btn.dataset.projectName, btn)
      );
    });
  } catch (err) {
    setProjectsGridMode("empty");
    projectsGrid.innerHTML = `<div class="projects-empty"><p class="projects-empty-text status-error">${escapeHtml(
      err?.message || "Failed to load projects."
    )}</p></div>`;
  }
}

searchInput?.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    loadProjects(searchInput.value.trim());
  }, 250);
});

async function deleteProject(projectId, projectName, button) {
  const label = projectName || "this project";
  const confirmed = await showConfirm(
    `Delete ${label}? This will permanently remove the project and all related reviews.`,
    { confirmLabel: "Delete", danger: true }
  );
  if (!confirmed) {
    return;
  }

  if (button) button.disabled = true;

  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: "DELETE",
      headers: authHeaders()
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data?.error?.message || "Failed to delete project.");
    }

    await loadProjects(searchInput?.value?.trim() || "");
  } catch (err) {
    await showAlert(err.message || "Failed to delete project.");
    if (button) button.disabled = false;
  }
}

verifyBtn?.addEventListener("click", async () => {
  const repoUrl = String(document.getElementById("repo-url")?.value || "").trim();
  const githubToken = String(document.getElementById("github-token")?.value || "").trim();

  if (!repoUrl) {
    setStatus("Enter a repository URL first.", "status-error");
    return;
  }

  verifyBtn.disabled = true;
  setStatus("Verifying repository...");

  try {
    const response = await fetch("/api/projects/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ repoUrl, githubToken: githubToken || undefined })
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data?.error?.message || "Verification failed.");
    }

    if (data.requiresToken) {
      tokenSection.hidden = false;
      verifyResult.hidden = false;
      verifyResult.innerHTML =
        '<p class="body-md status-error">Repository not accessible. Add a GitHub token below and verify again.</p>';
      verifiedRepo = null;
      addBtn.disabled = true;
      setStatus("Token required for this repository.", "status-error");
      return;
    }

    verifiedRepo = data.repository;
    verifyResult.hidden = false;
    verifyResult.innerHTML = `<p class="body-md status-success">Verified <strong>${escapeHtml(
      data.repository.fullName
    )}</strong> (${data.repository.isPrivate ? "private" : "public"})</p>`;
    addBtn.disabled = false;
    setStatus("Repository verified. You can add it now.", "status-success");
  } catch (err) {
    setStatus(err.message || "Verification failed.", "status-error");
  } finally {
    verifyBtn.disabled = false;
  }
});

addForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!verifiedRepo) {
    setStatus("Verify the repository before adding.", "status-error");
    return;
  }

  const repoUrl = String(document.getElementById("repo-url")?.value || "").trim();
  const githubToken = String(document.getElementById("github-token")?.value || "").trim();

  addBtn.disabled = true;
  setStatus("Adding project...");

  try {
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ repoUrl, githubToken: githubToken || undefined })
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data?.error?.message || "Failed to add project.");
    }

    closeModal();
    await loadProjects(searchInput?.value?.trim() || "");
    window.location.assign(`/project?id=${encodeURIComponent(data.project.id)}`);
  } catch (err) {
    setStatus(err.message || "Failed to add project.", "status-error");
    addBtn.disabled = false;
  }
});

const authed = await requireAuth();
if (authed) {
  await initNavAuth();
  await loadProjects();
}
