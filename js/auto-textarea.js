/* Авто-увеличение textarea по содержимому + ручной resize */
const AUTO_GROW_MIN_PX = 40;

function autoGrowTextarea(el) {
  if (!el || el.tagName !== "TEXTAREA") return;
  el.style.height = "auto";
  const min = Math.max(AUTO_GROW_MIN_PX, parseInt(el.dataset.minHeight, 10) || 0);
  el.style.height = `${Math.max(min, el.scrollHeight)}px`;
}

function bindAutoGrowTextarea(el) {
  if (!el || el.tagName !== "TEXTAREA" || el.dataset.autoGrowBound) return;
  if (el.classList.contains("sc-expand")) return;
  el.dataset.autoGrowBound = "1";
  el.classList.add("auto-grow");
  const grow = () => autoGrowTextarea(el);
  el.addEventListener("input", grow);
  el.addEventListener("change", grow);
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => {
      if (el.offsetHeight < el.scrollHeight) grow();
    });
    ro.observe(el);
    el._autoGrowRo = ro;
  }
  requestAnimationFrame(grow);
}

function bindAutoGrowTextareas(root) {
  const scope = root && root.querySelectorAll ? root : document;
  const host = root?.querySelectorAll ? root : document;
  host.querySelectorAll("textarea:not(.sc-expand)").forEach(bindAutoGrowTextarea);
  return scope;
}

function observeAutoGrowRoot(root) {
  if (!root || root.dataset.autoGrowObs) return;
  root.dataset.autoGrowObs = "1";
  bindAutoGrowTextareas(root);
  const mo = new MutationObserver(mutations => {
    for (const m of mutations) {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.tagName === "TEXTAREA") bindAutoGrowTextarea(node);
        node.querySelectorAll?.("textarea:not(.sc-expand)")?.forEach(bindAutoGrowTextarea);
      });
    }
  });
  mo.observe(root, { childList: true, subtree: true });
  root._autoGrowMo = mo;
}

window.autoGrowTextarea = autoGrowTextarea;
window.bindAutoGrowTextarea = bindAutoGrowTextarea;
window.bindAutoGrowTextareas = bindAutoGrowTextareas;
window.observeAutoGrowRoot = observeAutoGrowRoot;
