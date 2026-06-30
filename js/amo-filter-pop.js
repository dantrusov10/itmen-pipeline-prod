/* Закрытие панелей фильтров: клик снаружи + крестик */
let amoFilterPopCtx = null;

function bindAmoFilterGlobalClose() {
  if (window.__amoFilterGlobalCloseBound) return;
  window.__amoFilterGlobalCloseBound = true;
  document.addEventListener("click", e => {
    if (!amoFilterPopCtx) return;
    const { pop, anchor, onClose } = amoFilterPopCtx;
    if (anchor?.contains(e.target)) return;
    if (pop?.contains(e.target)) return;
    onClose?.();
    amoFilterPopCtx = null;
  }, true);
}

function registerAmoFilterPop(pop, anchor, onClose) {
  bindAmoFilterGlobalClose();
  amoFilterPopCtx = { pop, anchor, onClose };
}

function unregisterAmoFilterPop() {
  amoFilterPopCtx = null;
}

window.registerAmoFilterPop = registerAmoFilterPop;
window.unregisterAmoFilterPop = unregisterAmoFilterPop;
