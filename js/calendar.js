/* Календарь задач */
let calendarMonth = new Date();

async function renderCalendar() {
  const el = document.getElementById("page-calendar");
  if (!el) return;
  const y = calendarMonth.getFullYear();
  const m = calendarMonth.getMonth();
  el.innerHTML = `<div class="calendar-toolbar">
    <button type="button" class="btn btn-sm" id="cal-prev">◀</button>
    <strong>${calendarMonth.toLocaleString("ru", { month: "long", year: "numeric" })}</strong>
    <button type="button" class="btn btn-sm" id="cal-next">▶</button>
    <label class="muted" style="margin-left:1rem"><input type="checkbox" id="cal-mine" checked> Только мои</label>
  </div><div id="cal-grid" class="muted">Загрузка…</div>`;
  document.getElementById("cal-prev").onclick = () => { calendarMonth.setMonth(m - 1); renderCalendar(); };
  document.getElementById("cal-next").onclick = () => { calendarMonth.setMonth(m + 1); renderCalendar(); };
  document.getElementById("cal-mine").onchange = () => renderCalendar();
  const from = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const last = new Date(y, m + 1, 0).getDate();
  const to = `${y}-${String(m + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  try {
    const { items } = await apiCalendarTasks({
      from, to,
      mine: document.getElementById("cal-mine")?.checked ? "1" : "",
    });
    renderCalendarGrid(y, m, items || []);
  } catch (e) {
    document.getElementById("cal-grid").textContent = e.message;
  }
}

function renderCalendarGrid(y, m, tasks) {
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const byDay = {};
  tasks.forEach(t => {
    const d = (t.dueAt || "").slice(0, 10);
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(t);
  });
  let html = `<div class="cal-weekdays"><span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Вс</span></div><div class="cal-days">`;
  for (let i = 0; i < firstDow; i++) html += `<div class="cal-day empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const list = byDay[key] || [];
    html += `<div class="cal-day${list.length ? " has-tasks" : ""}">
      <div class="cal-day-num">${d}</div>
      ${list.map(t => `<div class="cal-task" title="${escapeHtml(t.title)}" onclick="openDealById('${escapeHtml(t.dealId)}')">${escapeHtml(t.customer || t.dealId)}</div>`).join("")}
    </div>`;
  }
  html += "</div>";
  document.getElementById("cal-grid").innerHTML = html;
}

window.renderCalendar = renderCalendar;
