import { enhanceHomeNavLink, navItemMarkup, enhanceBrandLink } from "./nav-icons.js";

const TOKEN_KEY = "sentry:token";
const USER_KEY = "sentry:user";

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setAuthSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function authHeaders() {
  const token = getStoredToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderSignedOut() {
  return `<a class="button button-secondary nav-action" href="/auth" aria-label="Sign In">${navItemMarkup("Sign In", "login")}</a>`;
}

function renderSignedIn() {
  return `<a class="button button-primary nav-action" href="/projects" aria-label="Projects">${navItemMarkup("Projects", "projects")}</a>
    <button type="button" class="button button-secondary nav-action" id="nav-logout" aria-label="Logout">${navItemMarkup("Logout", "logout")}</button>`;
}

export async function logout() {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: authHeaders()
    });
  } catch {
    // Client session is cleared regardless.
  }
  clearAuthSession();
  window.location.assign("/");
}

async function validateSession() {
  const token = getStoredToken();
  if (!token) return false;

  try {
    const response = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      clearAuthSession();
      return false;
    }
    if (data.user) {
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    }
    return true;
  } catch {
    return Boolean(getStoredToken());
  }
}

export async function initNavAuth() {
  enhanceBrandLink();
  enhanceHomeNavLink();

  const slot = document.getElementById("nav-auth");
  if (!slot) return;

  const signedIn = await validateSession();
  slot.innerHTML = signedIn ? renderSignedIn() : renderSignedOut();

  if (signedIn) {
    slot.querySelector("#nav-logout")?.addEventListener("click", logout);
  }
}

export async function requireGuest() {
  const signedIn = await validateSession();
  if (signedIn) {
    window.location.replace("/");
  }
}

export async function requireAuth() {
  const signedIn = await validateSession();
  if (!signedIn) {
    window.location.replace("/auth");
    return false;
  }
  return true;
}

export { escapeHtml, validateSession };
