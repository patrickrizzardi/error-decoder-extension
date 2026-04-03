import { marked } from "marked";
import DOMPurify from "dompurify";
import { copyToClipboard } from "./ui";

export const renderMarkdownWithCopyButtons = (
  markdown: string,
  container: HTMLElement,
  options?: { showCopyAll?: boolean }
): void => {
  container.innerHTML = DOMPurify.sanitize(marked.parse(markdown) as string);

  container.querySelectorAll("pre").forEach((pre) => {
    const wrapper = document.createElement("div");
    wrapper.className = "code-block";
    pre.parentNode?.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.textContent = "Copy";
    btn.addEventListener("click", () => copyToClipboard(btn, () => pre.textContent || ""));
    wrapper.appendChild(btn);
  });

  if (options?.showCopyAll) {
    const toolbar = document.createElement("div");
    toolbar.className = "result-toolbar";
    const copyAllBtn = document.createElement("button");
    copyAllBtn.className = "btn btn-secondary copy-all-btn";
    copyAllBtn.textContent = "Copy";
    copyAllBtn.addEventListener("click", () => copyToClipboard(copyAllBtn, () => markdown, "Copy"));
    toolbar.appendChild(copyAllBtn);
    container.insertBefore(toolbar, container.firstChild);
  }
};
