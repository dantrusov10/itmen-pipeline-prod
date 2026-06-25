/* Календарь задач — недельный вид (Outlook) */
let calendarWeekStart = startOfWeek(new Date());
let calendarView = "week";

function startOfWeek(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function renderCalendar() {
  const el = document.getElementById("page-calendar");
  if (!el) return;
  const admin = typeof isAdmin === "function" && isAdmin();
  const owners = (state?.lists?.owners || []).filter(Boolean);
  const ws = calendarView === "week" ? startOfWeek(calendarWeekStart) : new Date(calendarWeekStart.getFullYear(), calendarWeekStart.getMonth(), 1);
  const we = calendarView === "week" ? addDays(ws, 6) : new Date(ws.getFullYear(), ws.getMonth() + 1, 0);

  el.innerHTML = `<div class="calendar-toolbar">
    <button type="button" class="btn btn-sm" id="cal-prev">◀</button>
    <button type="button" class="btn btn-sm" id="cal-today">Сегодня</button>
    <button type="button" class="btn btn-sm" id="cal-next">▶</button>
    <strong class="cal-range-label">${calendarView === "week"
      ? `${ws.toLocaleDateString("ru", { day: "numeric", month: "short" })} — ${we.toLocaleDateString("ru", { day: "numeric", month: "short", year: "numeric" })}`
      : ws.toLocaleString("ru", { month: "long", year: "numeric" })}</strong>
    ${admin ? `<select id="cal-assignee" class="cal-assignee-select">
      <option value="">Все менеджеры</option>
      <option value="__mine__">Только мои</option>
      ${owners.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("")}
    </select>` : `<span class="muted">Мои задачи</span>`}
    <div class="cal-view-toggle">
      <button type="button" class="btn btn-sm ${calendarView === "week" ? "btn-primary" : ""}" data-view="week">Неделя</button>
      <button type="button" class="btn btn-sm ${calendarView === "month" ? "btn-primary" : ""}" data-view="month">Месяц</button>
    </div>
  </div><div id="cal-grid" class="muted">Загрузка…</div>`;

  document.getElementById("cal-prev").onclick = () => {
    calendarWeekStart = addDays(calendarWeekStart, calendarView === "week" ? -7 : -30);
    renderCalendar();
  };
  document.getElementById("cal-next").onclick = () => {
    calendarWeekStart = addDays(calendarWeekStart, calendarView === "week" ? 7 : 30);
    renderCalendar();
  };
  document.getElementById("cal-today").onclick = () => {
    calendarWeekStart = startOfWeek(new Date());
    renderCalendar();
  };
  el.querySelectorAll("[data-view]").forEach(btn => {
    btn.onclick = () => { calendarView = btn.dataset.view; renderCalendar(); };
  });
  document.getElementById("cal-assignee")?.addEventListener("change", () => renderCalendar());

  const from = fmtDate(ws);
  const to = fmtDate(we);

  const params = { from, to };
  if (admin) {
    const sel = document.getElementById("cal-assignee")?.value || "";
    if (sel === "__mine__") params.mine = "1";
    else if (sel) params.assignee = sel;
  } else {
    params.mine = "1";
  }

  try {
    const { items } = await apiCalendarTasks(params);
    if (calendarView === "week") renderCalendarWeek(ws, items || []);
    else renderCalendarMonth(ws.getFullYear(), ws.getMonth(), items || []);
  } catch (e) {
    document.getElementById("cal-grid").innerHTML = `<p class="muted" style="color:#b45309">${escapeHtml(e.message)}</p>`;
  }
}

function taskDateKey(t) {
  return (t.dueAt || "").slice(0, 10);
}

function taskHour(t) {
  const raw = t.dueAt || "";
  if (raw.length > 10 && raw.includes("T")) {
    const h = parseInt(raw.slice(11, 13), 10);
    if (!Number.isNaN(h)) return Math.max(8, Math.min(19, h));
  }
  return 9;
}

function renderCalendarWeek(weekStart, tasks) {
  const hours = [];
  for (let h = 8; h <= 20; h++) hours.push(h);
  const days = [...Array(7)].map((_, i) => addDays(weekStart, i));
  const bySlot = {};
  tasks.forEach(t => {
    const key = taskDateKey(t);
    const hour = taskHour(t);
    const slot = `${key}-${hour}`;
    if (!bySlot[slot]) bySlot[slot] = [];
    bySlot[slot].push(t);
  });

  let html = `<div class="cal-week-wrap"><div class="cal-week-grid" style="--cal-hours:${hours.length}">`;
  html += `<div class="cal-week-corner"></div>`;
  days.forEach(d => {
    const isToday = fmtDate(d) === fmtDate(new Date());
    html += `<div class="cal-week-dayhead${isToday ? " today" : ""}">
      <span class="cal-dow">${d.toLocaleDateString("ru", { weekday: "short" })}</span>
      <span class="cal-dom">${d.getDate()}</span></div>`;
  });
  hours.forEach(h => {
    html += `<div class="cal-time-label">${String(h).padStart(2, "0")}:00</div>`;
    days.forEach(d => {
      const key = `${fmtDate(d)}-${h}`;
      const list = bySlot[key] || [];
      html += `<div class="cal-slot" data-slot="${key}">
        ${list.map(t => `<div class="cal-event" title="${escapeHtml(t.title)}" onclick="openDealById('${escapeHtml(t.dealId)}')">
          <span class="cal-event-time">${String(taskHour(t)).padStart(2, "0")}:00</span>
          <span class="cal-event-title">${escapeHtml(t.title)}</span>
          <span class="cal-event-sub muted">${escapeHtml(t.customer || t.assignee || "")}</span>
        </div>`).join("")}
      </div>`;
    });
  });
  html += `</div></div>`;
  document.getElementById("cal-grid").innerHTML = html;
}

function renderCalendarMonth(y, m, tasks) {
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const byDay = {};
  tasks.forEach(t => {
    const d = taskDateKey(t);
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
