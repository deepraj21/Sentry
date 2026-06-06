let dialogEl = null;
let messageEl = null;
let cancelBtn = null;
let confirmBtn = null;
let resolvePromise = null;
let dialogMode = "confirm";

function ensureDialog() {
  if (dialogEl) return;

  dialogEl = document.createElement("div");
  dialogEl.id = "app-dialog";
  dialogEl.className = "modal app-dialog";
  dialogEl.hidden = true;
  dialogEl.setAttribute("role", "dialog");
  dialogEl.setAttribute("aria-modal", "true");
  dialogEl.setAttribute("aria-labelledby", "app-dialog-message");
  dialogEl.innerHTML = `
    <div class="modal-backdrop" data-dialog-dismiss></div>
    <div class="modal-panel card app-dialog-panel">
      <p id="app-dialog-message" class="app-dialog-message body-md"></p>
      <div class="modal-actions app-dialog-actions">
        <button type="button" class="button button-secondary" data-dialog-cancel>Cancel</button>
        <button type="button" class="button button-primary" data-dialog-confirm>OK</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialogEl);
  messageEl = dialogEl.querySelector("#app-dialog-message");
  cancelBtn = dialogEl.querySelector("[data-dialog-cancel]");
  confirmBtn = dialogEl.querySelector("[data-dialog-confirm]");

  cancelBtn.addEventListener("click", () => closeDialog(false));
  confirmBtn.addEventListener("click", () => closeDialog(true));
  dialogEl.querySelector("[data-dialog-dismiss]").addEventListener("click", () => {
    closeDialog(dialogMode === "alert");
  });

  document.addEventListener("keydown", onDialogKeydown);
}

function onDialogKeydown(event) {
  if (!dialogEl || dialogEl.hidden) return;

  if (event.key === "Escape") {
    event.preventDefault();
    closeDialog(dialogMode === "alert");
  }
}

function closeDialog(result) {
  if (!dialogEl || dialogEl.hidden) return;

  dialogEl.hidden = true;
  document.body.style.overflow = "";

  const resolve = resolvePromise;
  resolvePromise = null;
  resolve?.(result);
}

function openDialog(message, options = {}) {
  ensureDialog();

  dialogMode = options.mode || "confirm";
  messageEl.textContent = String(message || "");
  cancelBtn.hidden = dialogMode === "alert";
  cancelBtn.textContent = options.cancelLabel || "Cancel";
  confirmBtn.textContent = options.confirmLabel || (dialogMode === "alert" ? "OK" : "OK");

  confirmBtn.classList.toggle("button-primary", options.danger !== true);
  confirmBtn.classList.toggle("button-danger", options.danger === true);

  dialogEl.hidden = false;
  document.body.style.overflow = "hidden";

  if (dialogMode === "alert") {
    confirmBtn.focus();
  } else {
    cancelBtn.focus();
  }

  return new Promise((resolve) => {
    resolvePromise = resolve;
  });
}

/**
 * @param {string} message
 * @param {{ confirmLabel?: string, cancelLabel?: string, danger?: boolean }} [options]
 * @returns {Promise<boolean>}
 */
export function showConfirm(message, options = {}) {
  return openDialog(message, { ...options, mode: "confirm" });
}

/**
 * @param {string} message
 * @param {{ confirmLabel?: string }} [options]
 * @returns {Promise<void>}
 */
export async function showAlert(message, options = {}) {
  await openDialog(message, { ...options, mode: "alert" });
}
