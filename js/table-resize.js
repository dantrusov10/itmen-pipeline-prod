/* Изменение ширины столбцов таблицы с сохранением в localStorage */

function initTableColumnResize(tableEl, storageKey) {
  if (!tableEl || tableEl.dataset.resizeBound) return;
  tableEl.dataset.resizeBound = "1";
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch (_) { saved = {}; }

  const applyWidth = (th, w) => {
    const px = `${w}px`;
    th.style.width = px;
    th.style.minWidth = px;
    th.style.maxWidth = px;
    const idx = [...th.parentNode.children].indexOf(th);
    tableEl.querySelectorAll("tbody tr").forEach(tr => {
      const td = tr.children[idx];
      if (td) {
        td.style.width = px;
        td.style.minWidth = px;
        td.style.maxWidth = px;
      }
    });
  };

  const headRow = tableEl.querySelector("thead tr:first-child");
  if (!headRow) return;

  headRow.querySelectorAll("th").forEach((th, i) => {
    if (th.classList.contains("col-bulk") || th.classList.contains("col-actions")) return;
    const key = th.dataset.sort || th.dataset.col || `col-${i}`;
    if (saved[key]) applyWidth(th, parseInt(saved[key], 10));

    if (th.querySelector(".col-resize-handle")) return;
    th.classList.add("col-resizable");
    const handle = document.createElement("span");
    handle.className = "col-resize-handle";
    handle.title = "Изменить ширину";
    th.appendChild(handle);

    handle.addEventListener("mousedown", e => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.pageX;
      const startW = th.offsetWidth;
      document.body.classList.add("col-resizing");

      const onMove = ev => {
        const w = Math.max(48, startW + ev.pageX - startX);
        applyWidth(th, w);
      };
      const onUp = () => {
        document.body.classList.remove("col-resizing");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        saved[key] = th.offsetWidth;
        localStorage.setItem(storageKey, JSON.stringify(saved));
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  });
}

window.initTableColumnResize = initTableColumnResize;
