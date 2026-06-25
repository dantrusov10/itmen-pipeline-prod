/* Профиль + админка пользователей */
async function renderProfile() {
  const el = document.getElementById("page-profile");
  if (!el) return;
  const admin = isAdmin();
  el.innerHTML = `<div class="profile-grid">
    <div class="card"><div class="card-body" id="profile-self"><p class="muted">Загрузка…</p></div></div>
    ${admin ? `<div class="card"><div class="card-body" id="profile-admin"><h3>Администрирование</h3><p class="muted">Загрузка…</p></div></div>` : ""}
  </div>`;
  await renderProfileSelf();
  if (admin) await renderProfileAdmin();
}

async function renderProfileSelf() {
  const box = document.getElementById("profile-self");
  if (!box) return;
  try {
    const { profile } = await apiGetProfile();
    const u = window.ITMEN_AUTH?.user || {};
    box.innerHTML = `
      <h3>Личный кабинет</h3>
      <p class="muted">${escapeHtml(u.displayName || u.email)} · ${u.role === "admin" ? "админ" : "менеджер"}</p>
      ${profile.avatarUrl ? `<div class="profile-avatar-wrap"><img src="${escapeHtml(profile.avatarUrl)}" class="profile-avatar" alt=""></div>` : `<div class="profile-avatar-wrap"><span class="owner-avatar owner-avatar-ph" style="width:72px;height:72px"></span></div>`}
      <div class="form-grid" style="margin-top:1rem">
        <div><label>Телефон</label><input id="prof-phone" value="${escapeHtml(profile.phone)}"></div>
      </div>
      <div class="profile-notify" style="margin-top:1rem">
        <label><input type="checkbox" id="prof-notify-email" ${profile.notifyEmail ? "checked" : ""}> Email-уведомления</label>
        <label><input type="checkbox" id="prof-notify-task" ${profile.notifyTaskDue ? "checked" : ""}> Просроченные задачи</label>
        <label><input type="checkbox" id="prof-notify-deal" ${profile.notifyDealAssigned ? "checked" : ""}> Передача сделок</label>
        <label><input type="checkbox" id="prof-notify-comment" ${profile.notifyComments ? "checked" : ""}> Комментарии</label>
      </div>
      <div style="margin-top:1rem">
        <label>Аватар (JPG/PNG, до 5 МБ)</label><input type="file" id="prof-avatar" accept="image/*">
      </div>
      <button type="button" class="btn btn-primary btn-sm" id="prof-save" style="margin-top:1rem">Сохранить настройки</button>
      <hr style="margin:1.5rem 0">
      <h4>Смена пароля</h4>
      <div class="form-grid">
        <div><label>Текущий</label><input type="password" id="pwd-old"></div>
        <div><label>Новый</label><input type="password" id="pwd-new"></div>
      </div>
      <button type="button" class="btn btn-sm" id="pwd-save" style="margin-top:.5rem">Сменить пароль</button>`;
    document.getElementById("prof-save").onclick = async () => {
      await apiUpdateProfile({
        phone: document.getElementById("prof-phone").value,
        notifyEmail: document.getElementById("prof-notify-email").checked,
        notifyTaskDue: document.getElementById("prof-notify-task").checked,
        notifyDealAssigned: document.getElementById("prof-notify-deal").checked,
        notifyComments: document.getElementById("prof-notify-comment").checked,
      });
      const f = document.getElementById("prof-avatar")?.files?.[0];
      if (f) await apiUploadAvatar(f);
      showToast("Профиль сохранён");
      if (typeof loadManagerAvatars === "function") await loadManagerAvatars();
      renderProfileSelf();
    };
    document.getElementById("pwd-save").onclick = async () => {
      try {
        await apiChangePassword(
          document.getElementById("pwd-old").value,
          document.getElementById("pwd-new").value,
        );
        showToast("Пароль изменён");
      } catch (e) { alert(e.message); }
    };
  } catch (e) {
    box.innerHTML = `<p class="muted">${escapeHtml(e.message)}</p>`;
  }
}

async function renderProfileAdmin() {
  const box = document.getElementById("profile-admin");
  if (!box) return;
  try {
    const { items } = await apiAdminListUsers();
    box.innerHTML = `
      <h3>Пользователи</h3>
      <table class="deals-table deals-table-compact"><thead><tr>
        <th>Email</th><th>Имя</th><th>Менеджер</th><th>Роль</th><th></th>
      </tr></thead><tbody>
        ${items.map(u => `<tr>
          <td>${escapeHtml(u.email)}</td>
          <td>${escapeHtml(u.displayName)}</td>
          <td>${escapeHtml(u.managerName)}</td>
          <td>${escapeHtml(u.role)}</td>
          <td><button class="btn btn-sm admin-edit" data-id="${u.id}">✏️</button>
          <button class="btn btn-sm admin-del" data-id="${u.id}">✕</button></td>
        </tr>`).join("")}
      </tbody></table>
      <button type="button" class="btn btn-primary btn-sm" id="admin-add-user" style="margin-top:1rem">+ Пользователь</button>
      <hr style="margin:1.5rem 0">
      <h4>Массовые операции по сделкам</h4>
      <p class="muted">Выберите сделки в таблице (чекбоксы), затем примените действие</p>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.5rem">
        <select id="bulk-action"><option value="stage">Сменить стадию</option><option value="owner">Сменить владельца</option><option value="archive">В архив</option></select>
        <input id="bulk-value" placeholder="Значение">
        <button type="button" class="btn btn-sm" id="bulk-run">Применить</button>
      </div>`;
    document.getElementById("admin-add-user").onclick = () => adminUserForm();
    box.querySelectorAll(".admin-edit").forEach(b => b.onclick = () => adminUserForm(items.find(x => x.id === b.dataset.id)));
    box.querySelectorAll(".admin-del").forEach(b => b.onclick = async () => {
      if (!confirm("Удалить пользователя?")) return;
      await apiAdminDeleteUser(b.dataset.id);
      renderProfileAdmin();
    });
    document.getElementById("bulk-run").onclick = async () => {
      const ids = typeof getSelectedDealIds === "function" ? getSelectedDealIds() : [];
      if (!ids.length) return alert("Выберите сделки в таблице");
      const action = document.getElementById("bulk-action").value;
      const value = document.getElementById("bulk-value").value;
      const res = await apiBulkDeals(action, ids, value);
      showToast(`Готово: ${res.results?.filter(r => r.ok).length || 0} из ${ids.length}`);
      await reloadPipelineFromServer();
    };
  } catch (e) {
    box.innerHTML = `<p class="muted">${escapeHtml(e.message)}</p>`;
  }
}

function adminUserForm(user) {
  const email = prompt("Email", user?.email || "");
  if (!email) return;
  const password = user ? null : prompt("Пароль (мин. 8 символов)");
  if (!user && !password) return;
  const displayName = prompt("Отображаемое имя", user?.displayName || "");
  const managerName = prompt("Имя менеджера (как в сделках)", user?.managerName || "");
  const role = prompt("Роль: admin или manager", user?.role || "manager");
  (async () => {
    await apiAdminSaveUser({
      email, password, displayName, managerName, role,
    }, user?.id);
    showToast("Пользователь сохранён");
    renderProfileAdmin();
  })().catch(e => alert(e.message));
}

window.renderProfile = renderProfile;
