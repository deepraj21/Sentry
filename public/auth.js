import {
  initNavAuth,
  requireGuest,
  setAuthSession
} from "./auth-session.js";

const tabs = document.querySelectorAll(".auth-tab");
const signinForm = document.getElementById("signin-form");
const signupForm = document.getElementById("signup-form");
const statusEl = document.getElementById("auth-status");

function setStatus(message, type = "") {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.remove("status-error", "status-success");
  if (type) statusEl.classList.add(type);
}

function setActiveTab(mode) {
  tabs.forEach((tab) => {
    const active = tab.dataset.tab === mode;
    tab.classList.toggle("auth-tab-active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });

  if (signinForm) signinForm.hidden = mode !== "signin";
  if (signupForm) signupForm.hidden = mode !== "signup";
  setStatus("");
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
});

setActiveTab("signin");

async function submitAuth(mode, form) {
  const formData = new FormData(form);
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  if (!username || !password) {
    setStatus("Username and password are required.", "status-error");
    return;
  }

  const endpoint = mode === "signup" ? "/api/auth/register" : "/api/auth/login";
  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data?.error?.message || "Authentication failed.");
    }

    setAuthSession(data.token, data.user);
    setStatus(
      mode === "signup" ? "Account created. Redirecting..." : "Signed in. Redirecting...",
      "status-success"
    );
    window.location.assign("/");
  } catch (err) {
    setStatus(err.message || "Something went wrong.", "status-error");
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

signinForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  submitAuth("signin", signinForm);
});

signupForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  submitAuth("signup", signupForm);
});

await requireGuest();
await initNavAuth();
