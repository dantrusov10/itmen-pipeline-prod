/* Уведомления и глобальный поиск */
async function refreshNotifications() {
  if (window.ITMEN_API?.backend !== "pocketbase") return;
  try {
    const { items } = await apiListNotifications(true);
    renderNotificationBell(items || []);
  } catch (_) {}
}

function renderNotificationBell(items) {
  let bell = document.getElementById("notif-bell");
  if (!bell) {
    const topbar = document.querySelector(".topbar > div");
    if (!topbar) return;
    bell = document.createElement("div");
    bell.id = "notif-bell";
    bell.style.cssText = "margin-left:auto;display:flex;align-items:center;gap:.5rem";
    topbar.appendChild(bell);
  }
  const n = items.length;
  bell.innerHTML = `
    <button type="button" class="btn btn-sm" id="notif-btn" title="Уведомления">🔔${n ? `<span class="notif-badge">${n}</span>` : ""}</button>
    <div id="search-wrap"><input type="search" id="global-search" placeholder="Поиск…" class="deals-global-search" style="max-width:200px"></div>`;
  document.getElementById("notif-btn").onclick = () => showNotificationsPanel(items);
  const searchInput = document.getElementById("global-search");
  let t;
  searchInput?.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => runGlobalSearch(searchInput.value), 300);
  });
}

function showNotificationsPanel(items) {
  let panel = document.getElementById("notif-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "notif-panel";
    panel.className = "notif-panel";
    document.body.appendChild(panel);
  }
  panel.innerHTML = `
    <div class="notif-panel-head">Уведомления
      <button type="button" class="btn btn-sm" id="notif-read-all">Прочитать все</button>
      <button type="button" class="btn btn-sm" onclick="document.getElementById('notif-panel').remove()">✕</button>
    </div>
    <div class="notif-list">${items.length ? items.map(n => `
      <a href="${escapeHtml(n.link || '#')}" class="notif-item" data-id="${n.id}">
        <strong>${escapeHtml(n.title)}</strong>
        <span class="muted">${escapeHtml(n.message || "")}</span>
      </a>`).join("") : "<p class='muted' style='padding:1rem'>Нет новых</p>"}</div>`;
  document.getElementById("notif-read-all").onclick = async () => {
    await apiMarkNotificationsRead([], true);
    panel.remove();
    refreshNotifications();
  };
  panel.querySelectorAll(".notif-item").forEach(a => {
    a.onclick = async e => {
      await apiMarkNotificationsRead([a.dataset.id]);
      refreshNotifications();
    };
  });
}

async function runGlobalSearch(q) {
  if (!q || q.length < 2) {
    document.getElementById("search-results")?.remove();
    return;
  }
  try {
    const data = await apiGlobalSearch(q);
    let panel = document.getElementById("search-results");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "search-results";
      panel.className = "search-results";
      document.getElementById("search-wrap")?.appendChild(panel);
    }
    const section = (title, rows, click) => rows?.length ? `
      <div class="search-section"><strong>${title}</strong>
        ${rows.map(r => `<div class="search-hit" data-id="${escapeHtml(r.id)}">${escapeHtml(r.customer || r.name || r.title || r.body || r.id)}</div>`).join("")}
      </div>` : "";
    panel.innerHTML =
      section("Сделки", data.deals) +
      section("Задачи", data.tasks) +
      section("Контакты", data.contacts) +
      section("Лента", data.activities) || "<p class='muted'>Ничего не найдено</p>";
    panel.querySelectorAll(".search-hit").forEach(hit => {
      hit.onclick = () => {
        const id = hit.dataset.id;
        const deal = data.deals?.find(d => d.id === id);
        if (deal) openDealById(deal.id);
        panel.remove();
      };
    });
  } catch (_) {}
}

window.refreshNotifications = refreshNotifications;
