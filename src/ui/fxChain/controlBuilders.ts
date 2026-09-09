export function buildLabeledSlider(
  text: string,
  min: number,
  max: number,
  step: number,
  value: number,
  formatFn: (n: number) => string,
): { row: HTMLDivElement; input: HTMLInputElement; valueSpan: HTMLSpanElement } {
  const row = document.createElement("div");
  row.className = "control-row";
  const label = document.createElement("label");
  const valueSpan = document.createElement("span");
  valueSpan.textContent = formatFn(value);
  label.append(`${text} `, valueSpan);
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  row.append(label, input);
  return { row, input, valueSpan };
}

export function buildLabeledSelect(
  text: string,
  options: { value: string; label: string }[],
  selected: string,
): { row: HTMLDivElement; select: HTMLSelectElement } {
  const row = document.createElement("div");
  row.className = "control-row";
  const label = document.createElement("label");
  label.textContent = text;
  const select = document.createElement("select");
  options.forEach((o) => {
    const opt = document.createElement("option");
    opt.value = o.value;
    opt.textContent = o.label;
    if (o.value === selected) opt.selected = true;
    select.appendChild(opt);
  });
  row.append(label, select);
  return { row, select };
}
