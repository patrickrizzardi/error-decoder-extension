// Attach drag-to-resize behavior to any element via a grip pill
export const setupResizableGrip = (
  element: HTMLElement,
  grip: HTMLElement,
  minHeight = 40
) => {
  let isDragging = false;
  let startY = 0;
  let startHeight = 0;

  grip.addEventListener("mousedown", (e) => {
    isDragging = true;
    startY = e.clientY;
    startHeight = element.offsetHeight;
    e.preventDefault();

    const pill = grip.querySelector(".textarea-grip-pill") as HTMLElement;
    if (pill) pill.style.background = "rgba(86, 156, 214, 0.8)";
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const delta = e.clientY - startY;
    element.style.height = `${Math.max(minHeight, startHeight + delta)}px`;
  });

  document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    const pill = grip.querySelector(".textarea-grip-pill") as HTMLElement;
    if (pill) pill.style.background = "";
  });
};

export const copyToClipboard = async (
  btn: HTMLElement,
  getText: () => string | Promise<string>,
  originalText = "Copy"
) => {
  const text = await Promise.resolve(getText());
  await navigator.clipboard.writeText(text);
  btn.textContent = "Copied!";
  setTimeout(() => { btn.textContent = originalText; }, 2000);
};
