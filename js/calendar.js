/* Календарь задач — неделя / месяц / списком (все даты/часы — МСК) */
let calendarWeekStartKey = typeof mskWeekStartKey === "function" ? mskWeekStartKey() : "";
let calendarView = "week";
let calendarAssignee = "";
let calendarOverdueOnly = false;

function calWeekStartKey(ref) {
  if (typeof mskWeekStartKey === "function") {
    return mskWeekStartKey(ref instanceof Date ? ref : new Date());
  }
  const d = ref instanceof Date ? ref : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function calAddDaysKey(key, n) {
  if (typeof mskAddDaysKey === "function") return mskAddDaysKey(key, n);
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function calMonthStartKey(ref) {
  const key = calWeekStartKey(ref);
  const [y, m] = key.split("-");
  return `${y}-${m}-01`;
}

function calMonthEndKey(y, m0) {
  const last = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  return `${y}-${String(m0 + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

function parseTaskDueDate(t) {
  if (typeof parseMskDateTime === "function") return parseMskDateTime(t?.dueAt);
  const raw = String(t?.dueAt || "").trim();
  if (!raw) return null;
  const norm = raw.includes(" ") && !raw.includes("T") ? raw.replace(" ", "T") : raw;
  const d = new Date(norm);
  return Number.isNaN(d.getTime()) ? null : d;
}

function taskDateKey(t) {
  if (typeof mskDateKey === "function") return mskDateKey(t?.dueAt);
  const d = parseTaskDueDate(t);
  if (d && typeof mskParts === "function") {
    const p = mskParts(d);
    return `${p.year}-${p.month}-${p.day}`;
  }
  return (t.dueAt || "").slice(0, 10);
}

function taskHour(t) {
  if (typeof mskHour === "function") return mskHour(t?.dueAt);
  const d = parseTaskDueDate(t);
  if (!d) return 9;
  if (typeof mskParts === "function") {
    const h = parseInt(mskParts(d).hour, 10);
    return Math.max(8, Math.min(20, Number.isNaN(h) ? 9 : h));
  }
  return Math.max(8, Math.min(20, d.getHours()));
}

function taskTimeLabel(t) {
  if (typeof mskTimeLabel === "function") return mskTimeLabel(t?.dueAt);
  const d = parseTaskDueDate(t);
  if (!d) return "09:00";
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function taskStatusKind(t) {
  if (t.status === "done") return "done";
  if (typeof isTaskOverdueMsk === "function" && isTaskOverdueMsk(t.dueAt, t.status)) return "overdue";
  const due = taskDateKey(t);
  const today = typeof mskTodayKey === "function" ? mskTodayKey() : calWeekStartKey(new Date());
  if (due && due < today) return "overdue";
  return "planned";
}

function taskStatusLabel(kind) {
  if (kind === "done") return "Выполнена";
  if (kind === "overdue") return "Просрочена";
  return "Запланирована";
}

function taskStatusClass(kind) {
  if (kind === "done") return "cal-done";
  if (kind === "overdue") return "cal-overdue";
  return "cal-planned";
}

function fmtTaskDue(t) {
  if (typeof formatMskDateTimeLabel === "function") return formatMskDateTimeLabel(t?.dueAt);
  const d = parseTaskDueDate(t);
  if (!d) {
    const raw = t.dueAt || "";
    return raw ? raw.slice(0, 16).replace("T", " ") : "—";
  }
  const date = d.toLocaleDateString("ru", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Moscow" });
  const time = d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
  return `${date} ${time}`;
}

function calendarAssigneeParams(admin) {
  const params = { includeDone: "1" };
  if (admin) {
    const sel = calendarAssignee;
    if (sel === "__mine__") params.mine = "1";
    else if (sel) params.assignee = sel;
  } else {
    params.mine = "1";
  }
  return params;
}

function filterCalendarTasks(items) {
  let rows = items || [];
  if (calendarOverdueOnly) {
    rows = rows.filter(t => taskStatusKind(t) === "overdue");
  }
  return rows;
}

function renderCalEventHtml(t) {
  const kind = taskStatusKind(t);
  const cls = taskStatusClass(kind);
  const time = taskTimeLabel(t);
  return `<div class="cal-event ${cls}" title="${escapeHtml(t.title)}" onclick="openDealById('${escapeHtml(t.dealId)}')">
    <span class="cal-event-time">${escapeHtml(time)}</span>
    <span class="cal-event-sub">${escapeHtml(t.customer || "—")}</span>
    <span class="cal-event-title">${escapeHtml(t.title)}</span>
  </div>`;
}

async function renderCalendar() {
  const el = document.getElementById("page-calendar");
  if (!el) return;
  const admin = typeof isAdmin === "function" && isAdmin();
  const owners = (state?.lists?.owners || []).filter(Boolean);
  const ws = calendarView === "week" || calendarView === "list"
    ? calendarWeekStartKey
    : calMonthStartKey(calendarWeekStartKey);
  const we = calendarView === "week" || calendarView === "list"
    ? calAddDaysKey(ws, 6)
    : (() => {
      const [y, m] = ws.split("-").map(Number);
      return calMonthEndKey(y, m - 1);
    })();

  const wsRu = typeof isoDateKeyToRu === "function" ? isoDateKeyToRu(ws) : ws;
  const weRu = typeof isoDateKeyToRu === "function" ? isoDateKeyToRu(we) : we;
  const monthLabel = (() => {
    const [y, m] = ws.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, 1, 12, 0, 0));
    return dt.toLocaleString("ru-RU", { month: "long", year: "numeric", timeZone: "Europe/Moscow" });
  })();

  el.innerHTML = `<div class="calendar-toolbar">
    <button type="button" class="btn btn-sm" id="cal-prev">◀</button>
    <button type="button" class="btn btn-sm" id="cal-today">Сегодня</button>
    <button type="button" class="btn btn-sm" id="cal-next">▶</button>
    <strong class="cal-range-label">${calendarView === "month"
      ? monthLabel
      : `${wsRu} — ${weRu}`}</strong>
    ${admin ? `<select id="cal-assignee" class="cal-assignee-select">
      <option value=""${calendarAssignee === "" ? " selected" : ""}>Все менеджеры</option>
      <option value="__mine__"${calendarAssignee === "__mine__" ? " selected" : ""}>Только мои</option>
      ${owners.map(o => `<option value="${escapeHtml(o)}"${calendarAssignee === o ? " selected" : ""}>${escapeHtml(o)}</option>`).join("")}
    </select>` : `<span class="muted cal-mine-label">Мои задачи</span>`}
    ${calendarView === "list" ? `<label class="cal-overdue-toggle muted"><input type="checkbox" id="cal-overdue-only"${calendarOverdueOnly ? " checked" : ""}> Только просроченные</label>` : ""}
    <div class="cal-view-toggle">
      <button type="button" class="btn btn-sm ${calendarView === "week" ? "btn-primary" : ""}" data-view="week">Неделя</button>
      <button type="button" class="btn btn-sm ${calendarView === "month" ? "btn-primary" : ""}" data-view="month">Месяц</button>
      <button type="button" class="btn btn-sm ${calendarView === "list" ? "btn-primary" : ""}" data-view="list">Списком</button>
    </div>
  </div><div id="cal-grid" class="muted">Загрузка…</div>`;

  document.getElementById("cal-prev").onclick = () => {
    calendarWeekStartKey = calAddDaysKey(calendarWeekStartKey, calendarView === "month" ? -30 : -7);
    renderCalendar();
  };
  document.getElementById("cal-next").onclick = () => {
    calendarWeekStartKey = calAddDaysKey(calendarWeekStartKey, calendarView === "month" ? 30 : 7);
    renderCalendar();
  };
  document.getElementById("cal-today").onclick = () => {
    calendarWeekStartKey = calWeekStartKey(new Date());
    renderCalendar();
  };
  el.querySelectorAll("[data-view]").forEach(btn => {
    btn.onclick = () => { calendarView = btn.dataset.view; renderCalendar(); };
  });
  document.getElementById("cal-assignee")?.addEventListener("change", e => {
    calendarAssignee = e.target.value || "";
    renderCalendar();
  });
  document.getElementById("cal-overdue-only")?.addEventListener("change", e => {
    calendarOverdueOnly = e.target.checked;
    renderCalendar();
  });

  const from = ws;
  const to = we;
  const params = { ...calendarAssigneeParams(admin), from, to };

  try {
    const { items } = await apiCalendarTasks(params);
    const tasks = filterCalendarTasks(items || []);
    if (calendarView === "list") renderCalendarList(tasks);
    else if (calendarView === "week") renderCalendarWeek(ws, tasks);
    else {
      const [y, m] = ws.split("-").map(Number);
      renderCalendarMonth(y, m - 1, tasks);
    }
  } catch (e) {
    document.getElementById("cal-grid").innerHTML = `<p class="muted" style="color:#b45309">${escapeHtml(e.message)}</p>`;
  }
}

function renderCalendarWeek(weekStartKey, tasks) {
  const hours = [];
  for (let h = 8; h <= 20; h++) hours.push(h);
  const days = [...Array(7)].map((_, i) => calAddDaysKey(weekStartKey, i));
  const bySlot = {};
  tasks.forEach(t => {
    const key = taskDateKey(t);
    const hour = taskHour(t);
    const slot = `${key}-${hour}`;
    if (!bySlot[slot]) bySlot[slot] = [];
    bySlot[slot].push(t);
  });

  const todayKey = typeof mskTodayKey === "function" ? mskTodayKey() : calWeekStartKey(new Date());

  let html = `<div class="cal-week-wrap"><div class="cal-week-grid" style="--cal-hours:${hours.length}">`;
  html += `<div class="cal-week-corner"></div>`;
  days.forEach(key => {
    const isToday = key === todayKey;
    const dow = typeof mskDowLabel === "function" ? mskDowLabel(key) : "";
    const dom = typeof mskDom === "function" ? mskDom(key) : key.split("-")[2];
    html += `<div class="cal-week-dayhead${isToday ? " today" : ""}">
      <span class="cal-dow">${escapeHtml(dow)}</span>
      <span class="cal-dom">${escapeHtml(dom)}</span></div>`;
  });
  hours.forEach(h => {
    html += `<div class="cal-time-label">${String(h).padStart(2, "0")}:00</div>`;
    days.forEach(key => {
      const slotKey = `${key}-${h}`;
      const list = bySlot[slotKey] || [];
      html += `<div class="cal-slot" data-slot="${slotKey}">
        ${list.map(t => renderCalEventHtml(t)).join("")}
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
  let html = `<div class="cal-month-wrap"><div class="cal-weekdays"><span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Вс</span></div><div class="cal-days">`;
  for (let i = 0; i < firstDow; i++) html += `<div class="cal-day empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const list = byDay[key] || [];
    html += `<div class="cal-day${list.length ? " has-tasks" : ""}">
      <div class="cal-day-num">${d}</div>
      ${list.map(t => {
        const kind = taskStatusKind(t);
        return `<div class="cal-task ${taskStatusClass(kind)}" title="${escapeHtml(t.title)}" onclick="openDealById('${escapeHtml(t.dealId)}')">${escapeHtml(t.customer || t.dealId)}</div>`;
      }).join("")}
    </div>`;
  }
  html += "</div></div>";
  document.getElementById("cal-grid").innerHTML = html;
}

function renderCalendarList(tasks) {
  const sorted = [...tasks].sort((a, b) => String(a.dueAt || "").localeCompare(String(b.dueAt || "")));
  if (!sorted.length) {
    document.getElementById("cal-grid").innerHTML = `<p class="muted">Нет задач в выбранном периоде</p>`;
    return;
  }
  const rows = sorted.map(t => {
    const kind = taskStatusKind(t);
    return `<tr class="cal-list-row ${taskStatusClass(kind)}" onclick="openDealById('${escapeHtml(t.dealId)}')" style="cursor:pointer">
      <td>${escapeHtml(t.assignee || "—")}</td>
      <td><strong>${escapeHtml(t.customer || "—")}</strong></td>
      <td>${escapeHtml(t.title || "—")}</td>
      <td>${escapeHtml(fmtTaskDue(t))}</td>
      <td><span class="cal-status-badge ${taskStatusClass(kind)}">${escapeHtml(taskStatusLabel(kind))}</span></td>
    </tr>`;
  }).join("");
  document.getElementById("cal-grid").innerHTML = `
    <div class="cal-list-wrap">
      <table class="cal-list-table dash-table">
        <thead>
          <tr>
            <th>Менеджер</th>
            <th>Клиент</th>
            <th>Задача</th>
            <th>Срок</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="muted cal-list-meta">${sorted.length} задач</p>
    </div>`;
}

window.renderCalendar = renderCalendar;
