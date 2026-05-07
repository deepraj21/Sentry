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

function render() {
  const raw = localStorage.getItem("sentry:lastReport");
  if (!raw) {
    byId("report-title").textContent = "No report loaded";
    byId("report-summary").textContent =
      "Run an analysis first from the home page.";
    return;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    byId("report-title").textContent = "Unable to parse saved report";
    return;
  }

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
}

render();
