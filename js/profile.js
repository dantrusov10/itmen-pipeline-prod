/* Профиль + админка пользователей */
let profileAvatarPendingFile = null;
let profileAvatarPreviewUrl = "";

function cleanupProfileAvatarPreview() {
  if (profileAvatarPreviewUrl) {
    URL.revokeObjectURL(profileAvatarPreviewUrl);
    profileAvatarPreviewUrl = "";
  }
  profileAvatarPendingFile = null;
}

function renderProfileAvatarBlock(profile) {
  const src = profileAvatarPreviewUrl || profile.avatarUrl || "";
  return `
    <div class="profile-avatar-edit-wrap" id="prof-avatar-wrap">
      <div class="profile-avatar-preview" id="prof-avatar-preview">
        ${src
          ? `<img src="${escapeHtml(src)}" class="profile-avatar" alt="">`
          : `<span class="owner-avatar owner-avatar-ph profile-avatar-ph"></span>`}
        <button type="button" class="profile-avatar-edit-btn" id="prof-avatar-edit" title="Изменить аватар" aria-label="Изменить аватар">✏️</button>
      </div>
      <input type="file" id="prof-avatar-input" accept="image/jpeg,image/png,image/webp,image/gif" hidden>
      <p class="muted profile-avatar-hint">JPG/PNG, до 5 МБ. При замене старый аватар удаляется.</p>
    </div>`;
}

function bindProfileAvatarUi() {
  const input = document.getElementById("prof-avatar-input");
  const editBtn = document.getElementById("prof-avatar-edit");
  const preview = document.getElementById("prof-avatar-preview");
  editBtn?.addEventListener("click", () => input?.click());
  preview?.addEventListener("click", e => {
    if (e.target.closest(".profile-avatar-edit-btn")) return;
    input?.click();
  });
  input?.addEventListener("change", () => {
    const f = input.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      alert("Файл больше 5 МБ");
      input.value = "";
      return;
    }
    cleanupProfileAvatarPreview();
    profileAvatarPendingFile = f;
    profileAvatarPreviewUrl = URL.createObjectURL(f);
    const wrap = document.getElementById("prof-avatar-wrap");
    if (wrap) {
      wrap.outerHTML = renderProfileAvatarBlock({ avatarUrl: profileAvatarPreviewUrl });
      bindProfileAvatarUi();
    }
  });
}

async function renderProfile() {
  const el = document.getElementById("page-profile");
  if (!el) return;
  cleanupProfileAvatarPreview();
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
    let avatarUrl = profile.avatarUrl || "";
    if (avatarUrl && typeof apiFetchAvatarBlobUrl === "function") {
      try {
        avatarUrl = await apiFetchAvatarBlobUrl(avatarUrl) || avatarUrl;
      } catch (_) { /* keep path fallback */ }
    }
    const profileView = { ...profile, avatarUrl };
    const u = window.ITMEN_AUTH?.user || {};
    const roleLabel = (() => {
      const roles = typeof parseUserRoles === "function" ? parseUserRoles(u) : [u.role];
      if (roles.includes("admin")) return "админ";
      if (roles.includes("manager") && roles.includes("presale")) return "менеджер+пре-сейл";
      if (roles.includes("presale")) return "пре-сейл";
      return "менеджер";
    })();
    box.innerHTML = `
      <h3>Личный кабинет</h3>
      <p class="muted">${escapeHtml(u.displayName || u.email)} · ${roleLabel}</p>
      ${renderProfileAvatarBlock(profileView)}
      <div class="form-grid" style="margin-top:1rem">
        <div><label>Телефон</label><input id="prof-phone" value="${escapeHtml(profile.phone)}"></div>
      </div>
      <div class="profile-notify" style="margin-top:1rem">
        <label><input type="checkbox" id="prof-notify-email" ${profile.notifyEmail ? "checked" : ""}> Email-уведомления</label>
        <label><input type="checkbox" id="prof-notify-task" ${profile.notifyTaskDue ? "checked" : ""}> Просроченные задачи</label>
        <label><input type="checkbox" id="prof-notify-deal" ${profile.notifyDealAssigned ? "checked" : ""}> Передача сделок</label>
        <label><input type="checkbox" id="prof-notify-comment" ${profile.notifyComments ? "checked" : ""}> Комментарии</label>
      </div>
      <button type="button" class="btn btn-primary btn-sm" id="prof-save" style="margin-top:1rem">Сохранить настройки</button>
      <hr style="margin:1.5rem 0">
      <h4>Смена логина</h4>
      <p class="muted" style="font-size:.82rem;margin-bottom:.5rem">Текущий логин: <strong>${escapeHtml(profile.email || u.email || "")}</strong></p>
      <div class="form-grid">
        <div><label>Новый логин (email)</label><input type="email" id="login-new" placeholder="новый@email.ru" autocomplete="username"></div>
        <div><label>Пароль для подтверждения</label><input type="password" id="login-pwd" autocomplete="current-password"></div>
      </div>
      <button type="button" class="btn btn-sm" id="login-save" style="margin-top:.5rem">Сменить логин</button>
      <hr style="margin:1.5rem 0">
      <h4>Смена пароля</h4>
      <div class="form-grid">
        <div><label>Текущий</label><input type="password" id="pwd-old"></div>
        <div><label>Новый</label><input type="password" id="pwd-new"></div>
      </div>
      <button type="button" class="btn btn-sm" id="pwd-save" style="margin-top:.5rem">Сменить пароль</button>`;
    bindProfileAvatarUi();
    document.getElementById("prof-save").onclick = async () => {
      await apiUpdateProfile({
        phone: document.getElementById("prof-phone").value,
        notifyEmail: document.getElementById("prof-notify-email").checked,
        notifyTaskDue: document.getElementById("prof-notify-task").checked,
        notifyDealAssigned: document.getElementById("prof-notify-deal").checked,
        notifyComments: document.getElementById("prof-notify-comment").checked,
      });
      if (profileAvatarPendingFile) {
        await apiUploadAvatar(profileAvatarPendingFile);
        cleanupProfileAvatarPreview();
        if (typeof invalidateAvatarBlobCache === "function") invalidateAvatarBlobCache();
      }
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
    document.getElementById("login-save").onclick = async () => {
      const email = document.getElementById("login-new")?.value?.trim();
      const password = document.getElementById("login-pwd")?.value || "";
      if (!email) return alert("Укажите новый логин");
      if (!password) return alert("Укажите пароль для подтверждения");
      try {
        const res = await apiChangeEmail(email, password);
        if (res.token && res.user && typeof persistAuth === "function") {
          persistAuth({ token: res.token, user: res.user });
          if (typeof renderAuthTopbar === "function") renderAuthTopbar();
        }
        showToast("Логин изменён");
        renderProfileSelf();
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
    document.getElementById("admin-add-user").onclick = () => openAdminUserModal(null);
    box.querySelectorAll(".admin-edit").forEach(b => b.onclick = () => {
      openAdminUserModal(items.find(x => x.id === b.dataset.id));
    });
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

function closeAdminUserModal() {
  document.getElementById("admin-user-modal")?.classList.remove("open");
}

function openAdminUserModal(user) {
  let overlay = document.getElementById("admin-user-modal");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "admin-user-modal";
    overlay.className = "modal-overlay";
    document.body.appendChild(overlay);
    overlay.addEventListener("click", e => {
      if (e.target === overlay) closeAdminUserModal();
    });
  }
  const isEdit = Boolean(user?.id);
  overlay.innerHTML = `
    <div class="modal admin-user-modal" style="max-width:520px">
      <div class="modal-header modal-header-sticky">
        <h3>${isEdit ? "Редактировать пользователя" : "Новый пользователь"}</h3>
        <button type="button" class="btn btn-sm" id="admin-user-close" aria-label="Закрыть">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-grid form-grid-2">
          <div class="span-2"><label>Email (логин)</label>
            <input type="email" id="adm-email" value="${escapeHtml(user?.email || "")}" autocomplete="off"></div>
          <div class="span-2"><label>Пароль${isEdit ? " (оставьте пустым, чтобы не менять)" : ""}</label>
            <input type="password" id="adm-password" autocomplete="new-password"></div>
          <div><label>Отображаемое имя</label>
            <input type="text" id="adm-display" value="${escapeHtml(user?.displayName || "")}"></div>
          <div><label>Имя менеджера (как в сделках)</label>
            <input type="text" id="adm-manager" value="${escapeHtml(user?.managerName || "")}"></div>
          <div class="span-2"><label>Роль</label>
            <select id="adm-role">
              <option value="manager">Менеджер</option>
              <option value="presale">Пре-сейл</option>
              <option value="manager_presale">Менеджер + пре-сейл</option>
              <option value="admin">Администратор</option>
            </select></div>
        </div>
      </div>
      <div class="modal-footer" style="padding:.75rem 1rem;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:.5rem">
        <button type="button" class="btn btn-sm" id="admin-user-cancel">Отмена</button>
        <button type="button" class="btn btn-primary btn-sm" id="admin-user-save">Сохранить</button>
      </div>
    </div>`;
  const roleSel = overlay.querySelector("#adm-role");
  if (roleSel && user?.role) roleSel.value = user.role;

  overlay.querySelector("#admin-user-close")?.addEventListener("click", closeAdminUserModal);
  overlay.querySelector("#admin-user-cancel")?.addEventListener("click", closeAdminUserModal);
  overlay.querySelector("#admin-user-save")?.addEventListener("click", async () => {
    const email = overlay.querySelector("#adm-email")?.value?.trim();
    const password = overlay.querySelector("#adm-password")?.value || "";
    const displayName = overlay.querySelector("#adm-display")?.value?.trim();
    const managerName = overlay.querySelector("#adm-manager")?.value?.trim();
    const role = overlay.querySelector("#adm-role")?.value || "manager";
    if (!email) return alert("Укажите email");
    if (!isEdit && password.length < 8) return alert("Пароль минимум 8 символов");
    if (!displayName) return alert("Укажите отображаемое имя");
    if (!managerName) return alert("Укажите имя менеджера");
    try {
      const body = { email, displayName, managerName, role };
      if (password) body.password = password;
      await apiAdminSaveUser(body, user?.id);
      closeAdminUserModal();
      showToast("Пользователь сохранён");
      renderProfileAdmin();
    } catch (e) {
      alert(e.message || String(e));
    }
  });
  overlay.classList.add("open");
}

window.renderProfile = renderProfile;
