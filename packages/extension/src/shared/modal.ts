// Reusable themed confirmation modal — replaces browser confirm() dialogs

type ConfirmModalOptions = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmDanger?: boolean;
};

export const showConfirmModal = (options: ConfirmModalOptions): Promise<boolean> => {
  const {
    title,
    message,
    confirmText = "Confirm",
    cancelText = "Cancel",
    confirmDanger = false,
  } = options;

  return new Promise((resolve) => {
    // Overlay
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      background: "rgba(0, 0, 0, 0.6)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "99999",
      animation: "fadeIn 0.15s ease",
    });

    // Card
    const card = document.createElement("div");
    Object.assign(card.style, {
      background: "var(--bg-secondary, #252526)",
      border: "1px solid var(--border, #3e3e3e)",
      borderRadius: "10px",
      padding: "24px",
      maxWidth: "360px",
      width: "90%",
      color: "var(--text, #d4d4d4)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      animation: "scaleIn 0.15s ease",
    });

    // Title
    const titleEl = document.createElement("h3");
    titleEl.textContent = title;
    Object.assign(titleEl.style, {
      fontSize: "15px",
      fontWeight: "700",
      marginBottom: "8px",
      color: confirmDanger ? "var(--error-red, #f48771)" : "var(--text, #d4d4d4)",
    });

    // Message
    const messageEl = document.createElement("p");
    messageEl.textContent = message;
    Object.assign(messageEl.style, {
      fontSize: "13px",
      lineHeight: "1.5",
      color: "var(--text-muted, #808080)",
      marginBottom: "20px",
    });

    // Button row
    const btnRow = document.createElement("div");
    Object.assign(btnRow.style, {
      display: "flex",
      gap: "8px",
      justifyContent: "flex-end",
    });

    const btnBase = {
      padding: "8px 16px",
      borderRadius: "6px",
      fontSize: "13px",
      fontWeight: "600",
      cursor: "pointer",
      border: "none",
    };

    // Cancel button
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = cancelText;
    Object.assign(cancelBtn.style, {
      ...btnBase,
      background: "var(--bg, #1e1e1e)",
      color: "var(--text-muted, #808080)",
      border: "1px solid var(--border, #3e3e3e)",
    });

    // Confirm button
    const confirmBtn = document.createElement("button");
    confirmBtn.textContent = confirmText;
    Object.assign(confirmBtn.style, {
      ...btnBase,
      background: confirmDanger ? "var(--error-red, #f48771)" : "var(--accent, #569cd6)",
      color: "white",
    });

    const cleanup = (result: boolean) => {
      overlay.remove();
      style.remove();
      resolve(result);
    };

    cancelBtn.addEventListener("click", () => cleanup(false));
    confirmBtn.addEventListener("click", () => cleanup(true));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) cleanup(false);
    });

    // ESC to cancel
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        document.removeEventListener("keydown", onKeydown);
        cleanup(false);
      }
    };
    document.addEventListener("keydown", onKeydown);

    // Animations
    const style = document.createElement("style");
    style.textContent = `
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
    `;
    document.head.appendChild(style);

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);
    card.appendChild(titleEl);
    card.appendChild(messageEl);
    card.appendChild(btnRow);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    confirmBtn.focus();
  });
};
