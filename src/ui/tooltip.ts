export interface TooltipContent {
  title: string;
  description: string;
  howTo: string;
}

let tooltipEl: HTMLDivElement | null = null;

function getTooltipEl(): HTMLDivElement {
  if (tooltipEl) return tooltipEl;
  const el = document.createElement("div");
  el.className = "fx-tooltip";
  el.hidden = true;
  document.body.appendChild(el);
  tooltipEl = el;
  return el;
}

function showTooltip(anchor: HTMLElement, content: TooltipContent) {
  const el = getTooltipEl();
  el.innerHTML = "";

  const title = document.createElement("div");
  title.className = "fx-tooltip-title";
  title.textContent = content.title;

  const description = document.createElement("div");
  description.className = "fx-tooltip-description";
  description.textContent = content.description;

  const howTo = document.createElement("div");
  howTo.className = "fx-tooltip-howto";
  howTo.textContent = content.howTo;

  el.append(title, description, howTo);
  el.hidden = false;

  const anchorRect = anchor.getBoundingClientRect();
  const tipRect = el.getBoundingClientRect();
  const margin = 8;

  let top = anchorRect.top - tipRect.height - margin;
  if (top < margin) top = anchorRect.bottom + margin;

  let left = anchorRect.left + anchorRect.width / 2 - tipRect.width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));

  el.style.top = `${top + window.scrollY}px`;
  el.style.left = `${left + window.scrollX}px`;
}

function hideTooltip() {
  if (tooltipEl) tooltipEl.hidden = true;
}

/** Wires hover + keyboard-focus tooltip behavior onto an element. */
export function attachTooltip(anchor: HTMLElement, content: TooltipContent) {
  anchor.addEventListener("mouseenter", () => showTooltip(anchor, content));
  anchor.addEventListener("mouseleave", hideTooltip);
  anchor.addEventListener("focus", () => showTooltip(anchor, content));
  anchor.addEventListener("blur", hideTooltip);
}
