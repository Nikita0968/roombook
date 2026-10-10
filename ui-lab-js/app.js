// ============ SUPABASE ============
const SUPABASE_URL = "https://bxdxzbqmmhxkadywlhkm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4ZHh6YnFtbWh4a2FkeXdsaGttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzOTI1MDYsImV4cCI6MjEwNTk2ODUwNn0.bk5Pfc97ZeTzJcMq5vHxUI_S5Eux_U88H79uHxmWkkI";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============ DOM ============
const pages = document.querySelectorAll(".page");
const navLinks = document.querySelectorAll(".nav-link");
const bookingList = document.getElementById("bookingList");
const bookingForm = document.getElementById("bookingForm");
const submitButton = document.getElementById("submitButton");
const bookingDetails = document.getElementById("bookingDetails");
const confirmDialog = document.getElementById("confirmDialog");
const confirmTitle = document.getElementById("confirmTitle");
const confirmText = document.getElementById("confirmText");
const confirmActionButton = document.getElementById("confirmActionButton");
const closeDialogButton = document.getElementById("closeDialogButton");
const successOverlay = document.getElementById("successOverlay");
const errorOverlay = document.getElementById("errorOverlay");
const successMessage = document.getElementById("successMessage");
const errorMessage = document.getElementById("errorMessage");
const mainNav = document.getElementById("mainNav");
const roleBlock = document.getElementById("roleBlock");
const userInfo = document.getElementById("userInfo");
const logoutButton = document.getElementById("logoutButton");
const adminNavLink = document.getElementById("adminNavLink");
const adminGrid = document.getElementById("adminGrid");
const adminBookingList = document.getElementById("adminBookingList");
const adminUsersList = document.getElementById("adminUsersList");
const listSubtitle = document.getElementById("listSubtitle");
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const adminStatusFilter = document.getElementById("adminStatusFilter");
const calendarDate = document.getElementById("calendarDate");
const calendarGrid = document.getElementById("calendarGrid");
const notifWrap = document.getElementById("notifWrap");
const notifBell = document.getElementById("notifBell");
const notifCount = document.getElementById("notifCount");
const notifDropdown = document.getElementById("notifDropdown");
const notifList = document.getElementById("notifList");
const notifMarkAll = document.getElementById("notifMarkAll");
const userProfileContainer = document.getElementById("userProfile");
const backToAdminButton = document.getElementById("backToAdminButton");

let currentUser = null;
let currentProfile = null;
let currentBookingId = null;
let pendingAction = null;
let cachedBookings = [];
let chartStatusesInstance = null;
let chartRoomsInstance = null;
let notificationsChannel = null;
let cachedNotifications = [];

// 30-минутные слоты с 8:00 до 20:30
const CAL_SLOTS = [];
for (let h = 8; h <= 20; h++) {
  CAL_SLOTS.push({ start: `${String(h).padStart(2,"0")}:00`, end: `${String(h).padStart(2,"0")}:30` });
  CAL_SLOTS.push({ start: `${String(h).padStart(2,"0")}:30`, end: `${String(h+1).padStart(2,"0")}:00` });
}

// ============ OVERLAYS ============
function showSuccess(msg) {
  successMessage.textContent = msg;
  successOverlay.hidden = false;
}
function showError(msg) {
  errorMessage.textContent = msg;
  errorOverlay.hidden = false;
}
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-close-overlay]");
  if (btn) document.getElementById(btn.dataset.closeOverlay).hidden = true;
});
successOverlay.addEventListener("click", (e) => {
  if (e.target === successOverlay) successOverlay.hidden = true;
});
errorOverlay.addEventListener("click", (e) => {
  if (e.target === errorOverlay) errorOverlay.hidden = true;
});

// ============ NAV ============
function navigate(pageId) {
  pages.forEach((p) => { p.hidden = p.id !== pageId; });
  navLinks.forEach((l) => {
    l.classList.toggle("active", l.dataset.page === pageId);
  });
  if (pageId === "listPage") loadBookings();
  if (pageId === "adminPage") loadAdmin();
  if (pageId === "calendarPage") loadCalendar();
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-page]");
  if (t) {
    if (t.dataset.page === "adminPage" && currentProfile?.role !== "admin") {
      showError("Доступ только для администратора.");
      return;
    }
    navigate(t.dataset.page);
  }
});

document.getElementById("openCreateButton").addEventListener("click", () => {
  navigate("createPage");
});

// ============ UI AUTH ============
function showAuthenticatedUI() {
  mainNav.hidden = false;
  mainNav.style.display = "";
  roleBlock.hidden = false;
  roleBlock.style.display = "flex";

  const isAdmin = currentProfile?.role === "admin";
  adminNavLink.hidden = !isAdmin;
  adminNavLink.style.display = isAdmin ? "" : "none";

  userInfo.textContent = `${currentProfile.full_name} (${isAdmin ? "Администратор" : "Пользователь"})`;
  listSubtitle.textContent = isAdmin
    ? "Все брони (режим администратора)."
    : "Ваши брони аудиторий.";
}

function showAnonymousUI() {
  mainNav.hidden = true;
  mainNav.style.display = "none";
  roleBlock.hidden = true;
  roleBlock.style.display = "none";
  adminNavLink.hidden = true;
  adminNavLink.style.display = "none";

  if (notifDropdown) notifDropdown.hidden = true;
  if (notifCount) notifCount.hidden = true;

  if (notificationsChannel) {
    try { db.removeChannel(notificationsChannel); } catch (e) {}
    notificationsChannel = null;
  }

  currentUser = null;
  currentProfile = null;
  userInfo.textContent = "—";
  cachedNotifications = [];

  navigate("loginPage");
}

function setLoggedIn(user, profile) {
  currentUser = user;
  currentProfile = profile;
  showAuthenticatedUI();
  navigate("listPage");
  loadNotifications();
  subscribeNotifications();
}

function setLoggedOut() {
  currentUser = null;
  currentProfile = null;
  showAnonymousUI();
}

logoutButton.addEventListener("click", async () => {
  try { await db.auth.signOut(); } catch (err) { console.warn(err); }
  setLoggedOut();
  showSuccess("Вы вышли.");
});

// ============ ENSURE PROFILE ============
async function ensureProfile(user) {
  const { data: existing } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (existing) return existing;

  const newProfile = {
    id: user.id,
    email: user.email,
    full_name: user.user_metadata?.full_name || user.email.split("@")[0],
    role: "user"
  };

  const { data, error } = await db
    .from("profiles")
    .insert(newProfile)
    .select()
    .maybeSingle();

  if (error) console.warn("profile insert error:", error.message);
  return data || newProfile;
}

// ============ REGISTER ============
document.getElementById("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErrors();

  const fullName = document.getElementById("regName").value.trim();
  const email = document.getElementById("regEmail").value.trim().toLowerCase();
  const password = document.getElementById("regPassword").value;
  const password2 = document.getElementById("regPassword2").value;

  let ok = true;
  if (!fullName) { setError("regName", "Укажите имя."); ok = false; }
  if (!isValidEmail(email)) { setError("regEmail", "Некорректный email."); ok = false; }
  if (password.length < 6) { setError("regPassword", "Минимум 6 символов."); ok = false; }
  if (password !== password2) { setError("regPassword2", "Пароли не совпадают."); ok = false; }
  if (!ok) return;

  const btn = document.getElementById("registerSubmit");
  btn.disabled = true;
  btn.textContent = "Создание...";

  try {
    const { data, error } = await db.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } }
    });
    if (error) throw error;
    if (!data.user) throw new Error("Supabase не вернул пользователя.");

    const { error: profileErr } = await db.from("profiles").insert({
      id: data.user.id, email, full_name: fullName, role: "user"
    });
    if (profileErr) console.warn("profile insert error:", profileErr.message);

    document.getElementById("registerForm").reset();

    if (data.session) {
      const profile = await ensureProfile(data.user);
      setLoggedIn(data.user, profile);
      showSuccess("Аккаунт создан, вы вошли.");
    } else {
      showSuccess("Аккаунт создан. Войдите.");
      navigate("loginPage");
    }
  } catch (err) {
    console.error("register error:", err);
    showError("Ошибка регистрации: " + (err.message || err));
  } finally {
    btn.disabled = false;
    btn.textContent = "Создать аккаунт";
  }
});

// ============ LOGIN ============
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErrors();

  const email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const password = document.getElementById("loginPassword").value;

  let ok = true;
  if (!isValidEmail(email)) { setError("loginEmail", "Некорректный email."); ok = false; }
  if (!password) { setError("loginPassword", "Введите пароль."); ok = false; }
  if (!ok) return;

  const btn = document.getElementById("loginSubmit");
  btn.disabled = true;
  btn.textContent = "Вход...";

  try {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const profile = await ensureProfile(data.user);
    setLoggedIn(data.user, profile);
    document.getElementById("loginForm").reset();
    showSuccess("Вы вошли.");
  } catch (err) {
    console.error("login error:", err);
    showError("Не удалось войти: " + (err.message || err));
  } finally {
    btn.disabled = false;
    btn.textContent = "Войти";
  }
});

// ============ VALIDATION ============
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
function isValidEmail(v) { return EMAIL_RE.test(v || ""); }
function clearErrors() {
  document.querySelectorAll(".field-error").forEach((el) => el.textContent = "");
  document.querySelectorAll(".input-error").forEach((el) => el.classList.remove("input-error"));
}
function setError(fieldId, msg) {
  document.getElementById(fieldId)?.classList.add("input-error");
  const e = document.getElementById(fieldId + "Error");
  if (e) e.textContent = msg;
}

// ============ NOTIFICATIONS ============
async function loadNotifications() {
  if (!currentUser) return;

  const { data, error } = await db
    .from("notifications")
    .select("id, booking_id, title, message, is_read, created_at")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.warn("notifications load error:", error.message);
    return;
  }

  cachedNotifications = data || [];
  renderNotifications();
}

function renderNotifications() {
  const unread = cachedNotifications.filter((n) => !n.is_read).length;

  if (unread > 0) {
    notifCount.textContent = unread > 99 ? "99+" : String(unread);
    notifCount.hidden = false;
  } else {
    notifCount.hidden = true;
  }

  if (cachedNotifications.length === 0) {
    notifList.innerHTML = `<p class="notif-empty">Уведомлений нет.</p>`;
    return;
  }

  notifList.innerHTML = cachedNotifications.map((n) => `
    <div class="notif-item ${n.is_read ? "" : "unread"}" data-notif-id="${n.id}" data-booking-id="${n.booking_id || ""}">
      <p class="notif-title">${escapeHtml(n.title)}</p>
      <p class="notif-message">${escapeHtml(n.message)}</p>
      <p class="notif-time">${new Date(n.created_at).toLocaleString("ru-RU")}</p>
    </div>
  `).join("");
}

function subscribeNotifications() {
  if (!currentUser) return;

  if (notificationsChannel) {
    try { db.removeChannel(notificationsChannel); } catch (e) {}
  }

  notificationsChannel = db
    .channel("notif-" + currentUser.id)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${currentUser.id}`
      },
      (payload) => {
        cachedNotifications.unshift(payload.new);
        renderNotifications();
      }
    )
    .subscribe();
}

notifBell?.addEventListener("click", (e) => {
  e.stopPropagation();
  notifDropdown.hidden = !notifDropdown.hidden;
});

document.addEventListener("click", (e) => {
  if (!notifDropdown || notifDropdown.hidden) return;
  if (notifWrap && !notifWrap.contains(e.target)) {
    notifDropdown.hidden = true;
  }
});

notifList?.addEventListener("click", async (e) => {
  const item = e.target.closest("[data-notif-id]");
  if (!item) return;

  const notifId = Number(item.dataset.notifId);
  const bookingId = item.dataset.bookingId ? Number(item.dataset.bookingId) : null;

  const target = cachedNotifications.find((n) => n.id === notifId);
  if (target && !target.is_read) {
    target.is_read = true;
    renderNotifications();
    await db.from("notifications").update({ is_read: true }).eq("id", notifId);
  }

  notifDropdown.hidden = true;

  if (bookingId) {
    openBooking(bookingId);
  }
});

notifMarkAll?.addEventListener("click", async (e) => {
  e.stopPropagation();
  if (!currentUser) return;

  const unreadIds = cachedNotifications.filter((n) => !n.is_read).map((n) => n.id);
  if (unreadIds.length === 0) return;

  cachedNotifications.forEach((n) => { n.is_read = true; });
  renderNotifications();

  const { error } = await db
    .from("notifications")
    .update({ is_read: true })
    .in("id", unreadIds);

  if (error) console.warn("mark all error:", error.message);
});

// ============ BOOKINGS LIST ============
async function loadBookings() {
  bookingList.innerHTML = `<div class="empty-state"><p>Загрузка...</p></div>`;

  const { data, error } = await db
    .from("bookings")
    .select(`
      id, booking_date, start_time, end_time, purpose, status, created_at,
      rooms (name, building),
      profiles (email, full_name)
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("load bookings error:", error);
    bookingList.innerHTML = `<div class="empty-state"><p>Ошибка загрузки: ${escapeHtml(error.message)}</p></div>`;
    return;
  }

  cachedBookings = data || [];
  renderBookings();
}

function renderBookings() {
  const query = (searchInput?.value || "").trim().toLowerCase();
  const status = statusFilter?.value || "";

  const visible = cachedBookings.filter((b) => {
    const matchStatus = !status || b.status === status;
    const matchQuery = !query
      || (b.rooms?.name || "").toLowerCase().includes(query)
      || (b.purpose || "").toLowerCase().includes(query);
    return matchStatus && matchQuery;
  });

  if (visible.length === 0) {
    bookingList.innerHTML = `
      <div class="empty-state">
        <h2>Броней не найдено</h2>
        <p>Измените фильтр или создайте новую бронь.</p>
        <button class="button button-primary" data-page="createPage">Создать бронь</button>
      </div>`;
    return;
  }

  bookingList.innerHTML = visible.map((b) => `
    <article class="booking-card" tabindex="0" data-booking-id="${b.id}">
      <h2>№${b.id}. ${escapeHtml(b.rooms?.name || "—")}</h2>
      <div class="meta">
        <span>${escapeHtml(b.booking_date)}</span>
        <span>${escapeHtml(b.start_time)}–${escapeHtml(b.end_time)}</span>
        <span class="status">${escapeHtml(b.status)}</span>
        <span>${escapeHtml(b.profiles?.email || "—")}</span>
      </div>
    </article>
  `).join("");
}

searchInput?.addEventListener("input", renderBookings);
statusFilter?.addEventListener("change", renderBookings);

bookingList.addEventListener("click", (e) => {
  const card = e.target.closest("[data-booking-id]");
  if (card) openBooking(Number(card.dataset.bookingId));
});
bookingList.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    const card = e.target.closest("[data-booking-id]");
    if (card) openBooking(Number(card.dataset.bookingId));
  }
});

// ============ BOOKING DETAIL ============
async function openBooking(id) {
  const { data, error } = await db
    .from("bookings")
    .select(`
      id, booking_date, start_time, end_time, purpose, status, created_at, updated_at, user_id,
      rooms (name, building),
      profiles (email, full_name)
    `)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    console.error("open booking error:", error);
    showError("Бронь не найдена.");
    return;
  }

  currentBookingId = id;
  renderBookingDetails(data);

  const { data: history, error: historyError } = await db
    .from("status_history")
    .select(`id, old_status, new_status, changed_at, changed_by, profiles (email, full_name)`)
    .eq("booking_id", id)
    .order("changed_at", { ascending: false });

  if (historyError) {
    console.warn("history error:", historyError);
    renderHistory([]);
  } else {
    renderHistory(history || []);
  }

  navigate("detailPage");
}

function renderBookingDetails(item) {
  let actions = "";
  if (currentProfile?.role === "admin" && item.status === "На подтверждении") {
    actions += `<button id="approveButton" class="button button-primary">Подтвердить</button>`;
  }
  if (item.status === "На подтверждении" || item.status === "Подтверждено") {
    actions += `<button id="cancelButton" class="button button-secondary">Отменить бронь</button>`;
  }
  if (currentProfile?.role === "admin" && item.status === "Отменено") {
    actions += `<button id="deleteButton" class="button button-danger">Удалить бронь</button>`;
  }
  if (!actions) actions = `<p class="field-hint">Действия недоступны.</p>`;

  bookingDetails.innerHTML = `
    <div class="detail-card">
      <h1>Бронь №${item.id}</h1>
      <p><strong>Аудитория:</strong> ${escapeHtml(item.rooms?.name || "—")} (${escapeHtml(item.rooms?.building || "")})</p>
      <p><strong>Дата:</strong> ${escapeHtml(item.booking_date)}</p>
      <p><strong>Время:</strong> ${escapeHtml(item.start_time)}–${escapeHtml(item.end_time)}</p>
      <p><strong>Назначение:</strong> ${escapeHtml(item.purpose)}</p>
      <p><strong>Статус:</strong> <span class="status">${escapeHtml(item.status)}</span></p>
      <p><strong>Автор:</strong> ${escapeHtml(item.profiles?.email || "—")}</p>
      <p><strong>Создана:</strong> ${new Date(item.created_at).toLocaleString("ru-RU")}</p>
      <p><strong>Обновлена:</strong> ${new Date(item.updated_at).toLocaleString("ru-RU")}</p>
      <div class="actions">${actions}</div>
    </div>`;

  document.getElementById("approveButton")?.addEventListener("click", () => requestConfirm("confirm", item.id));
  document.getElementById("cancelButton")?.addEventListener("click", () => requestConfirm("cancel", item.id));
  document.getElementById("deleteButton")?.addEventListener("click", () => requestConfirm("delete", item.id));
}

function renderHistory(items) {
  const container = document.getElementById("bookingHistory");
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = `
      <div class="detail-card">
        <h2 style="font-size: 16px; margin: 0 0 8px 0;">История изменений</h2>
        <p class="field-hint">Изменений статуса пока не было.</p>
      </div>`;
    return;
  }

  const rows = items.map((h) => `
    <tr>
      <td>${escapeHtml(h.old_status || "—")}</td>
      <td>${escapeHtml(h.new_status)}</td>
      <td>${escapeHtml(h.profiles?.email || "система")}</td>
      <td>${new Date(h.changed_at).toLocaleString("ru-RU")}</td>
    </tr>
  `).join("");

  container.innerHTML = `
    <div class="detail-card">
      <h2 style="font-size: 16px; margin: 0 0 12px 0;">История изменений</h2>
      <table class="history-table">
        <thead>
          <tr><th>Было</th><th>Стало</th><th>Автор</th><th>Когда</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ============ CREATE BOOKING ============
bookingForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErrors();

  const roomName = bookingForm.elements.room.value;
  const date = bookingForm.elements.date.value;
  const startTime = bookingForm.elements.startTime.value;
  const endTime = bookingForm.elements.endTime.value;
  const purpose = bookingForm.elements.purpose.value.trim();

  let ok = true;
  if (!roomName) { setError("room", "Выберите аудиторию."); ok = false; }
  if (!date) { setError("date", "Укажите дату."); ok = false; }
  if (!startTime) { setError("startTime", "Укажите время начала."); ok = false; }
  if (!endTime) { setError("endTime", "Укажите время окончания."); ok = false; }
  if (startTime && endTime && startTime >= endTime) {
    setError("endTime", "Окончание должно быть позже начала."); ok = false;
  }
  if (purpose.length < 5) { setError("purpose", "Минимум 5 символов."); ok = false; }
  if (!ok) return;

  submitButton.disabled = true;
  submitButton.textContent = "Сохранение...";

  try {
    const { data: room, error: roomErr } = await db
      .from("rooms").select("id").eq("name", roomName).maybeSingle();
    if (roomErr || !room) throw new Error("Аудитория не найдена.");

    const { error: insertErr } = await db.from("bookings").insert({
      user_id: currentUser.id,
      room_id: room.id,
      booking_date: date,
      start_time: startTime,
      end_time: endTime,
      purpose,
      status: "На подтверждении"
    });

    if (insertErr) {
      if ((insertErr.message || "").includes("уже занята")) {
        setError("startTime", "Эта аудитория уже занята в выбранное время.");
        showError("Эта аудитория уже занята в выбранное время.");
        return;
      }
      throw insertErr;
    }

    bookingForm.reset();
    navigate("listPage");
    showSuccess("Бронь создана.");
  } catch (err) {
    console.error("create booking error:", err);
    showError("Не удалось сохранить: " + (err.message || err));
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Создать бронь";
  }
});

// ============ STATUS CHANGE / DELETE ============
function requestConfirm(type, id) {
  pendingAction = { type, id };

  if (type === "confirm") {
    confirmTitle.textContent = "Подтвердить бронь?";
    confirmText.textContent = "Статус изменится на «Подтверждено». Пользователь получит уведомление.";
    confirmActionButton.textContent = "Подтвердить";
    confirmActionButton.className = "button button-primary";
  } else if (type === "cancel") {
    confirmTitle.textContent = "Отменить бронь?";
    confirmText.textContent = "Статус изменится на «Отменено». Пользователь получит уведомление.";
    confirmActionButton.textContent = "Отменить";
    confirmActionButton.className = "button button-primary";
  } else if (type === "delete") {
    confirmTitle.textContent = "Удалить бронь навсегда?";
    confirmText.textContent = "Это действие нельзя отменить.";
    confirmActionButton.textContent = "Удалить";
    confirmActionButton.className = "button button-danger";
  }

  confirmDialog.showModal();
}

confirmActionButton.addEventListener("click", async () => {
  if (!pendingAction) return;
  const { type, id } = pendingAction;

  if (type === "delete") {
    const { error } = await db.from("bookings").delete().eq("id", id);
    pendingAction = null;
    confirmDialog.close();

    if (error) {
      showError("Не удалось удалить: " + error.message);
    } else {
      showSuccess("Бронь удалена.");
      navigate("listPage");
    }
    return;
  }

  const newStatus = type === "confirm" ? "Подтверждено" : "Отменено";
  const { error } = await db.from("bookings").update({ status: newStatus }).eq("id", id);

  pendingAction = null;
  confirmDialog.close();

  if (error) {
    showError("Не удалось изменить статус: " + error.message);
  } else {
    showSuccess(`Статус изменён на «${newStatus}».`);
    if (currentBookingId === id) openBooking(id);
  }
});

closeDialogButton.addEventListener("click", () => {
  pendingAction = null;
  confirmDialog.close();
});

// ============ CALENDAR ============
async function loadCalendar() {
  if (!calendarGrid) return;

  if (!calendarDate.value) {
    const today = new Date().toISOString().split("T")[0];
    calendarDate.value = today;
  }

  const date = calendarDate.value;
  calendarGrid.innerHTML = `<p style="padding:16px;">Загрузка...</p>`;

  const { data, error } = await db
    .from("bookings")
    .select(`
      id, start_time, end_time, status,
      rooms (name),
      profiles (email)
    `)
    .eq("booking_date", date);

  if (error) {
    console.error("calendar load error:", error);
    calendarGrid.innerHTML = `<p style="padding:16px;">Ошибка загрузки: ${escapeHtml(error.message)}</p>`;
    return;
  }

  const roomNames = Array.from(new Set((data || []).map((b) => b.rooms?.name).filter(Boolean)));
  if (roomNames.length === 0) {
    const fallbackRooms = Array.from(document.querySelectorAll("#room option"))
      .map((o) => o.value).filter(Boolean);
    roomNames.push(...fallbackRooms);
  }
  roomNames.sort();

  const headerCells = CAL_SLOTS.map((s) => `<th>${s.start}</th>`).join("");

  const rows = roomNames.map((roomName) => {
    const cellsHtml = CAL_SLOTS.map((slot) => {
      const booking = (data || []).find((b) =>
        b.rooms?.name === roomName &&
        b.start_time < slot.end &&
        b.end_time > slot.start
      );

      if (!booking) return `<td class="cal-slot free"></td>`;

      let cls = "pending";
      if (booking.status === "Подтверждено") cls = "confirmed";
      else if (booking.status === "Отменено") cls = "cancelled";

      const isStartCell = booking.start_time >= slot.start && booking.start_time < slot.end;
      const label = isStartCell
        ? `<span class="slot-label">${booking.start_time.slice(0,5)}–${booking.end_time.slice(0,5)}</span>`
        : "";

      return `<td class="cal-slot ${cls}" data-booking-id="${booking.id}" title="${escapeHtml(booking.profiles?.email || "")} ${escapeHtml(booking.start_time)}–${escapeHtml(booking.end_time)}">${label}</td>`;
    }).join("");

    return `<tr>
      <td class="room-col">${escapeHtml(roomName)}</td>
      ${cellsHtml}
    </tr>`;
  }).join("");

  calendarGrid.innerHTML = `
    <table class="calendar-table">
      <thead>
        <tr>
          <th class="room-col">Аудитория</th>
          ${headerCells}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

calendarDate?.addEventListener("change", loadCalendar);

calendarGrid?.addEventListener("click", (e) => {
  const slot = e.target.closest("[data-booking-id]");
  if (slot) openBooking(Number(slot.dataset.bookingId));
});

// ============ ADMIN ============
async function loadAdmin() {
  if (currentProfile?.role !== "admin") {
    showError("Доступ только для администратора.");
    navigate("listPage");
    return;
  }

  const filterValue = adminStatusFilter?.value || "";

  let query = db.from("bookings").select(`
    id, booking_date, start_time, end_time, purpose, status, created_at,
    rooms (name, building),
    profiles (email, full_name)
  `).order("created_at", { ascending: false });

  if (filterValue) query = query.eq("status", filterValue);

  const { data, error } = await query;
  const { count: usersCount } = await db
    .from("profiles")
    .select("*", { count: "exact", head: true });

  if (error) {
    adminGrid.innerHTML = `<p>Ошибка загрузки: ${escapeHtml(error.message)}</p>`;
    return;
  }

  const total = data.length;
  const pending = data.filter((b) => b.status === "На подтверждении").length;
  const confirmed = data.filter((b) => b.status === "Подтверждено").length;
  const cancelled = data.filter((b) => b.status === "Отменено").length;

  adminGrid.innerHTML = `
    <div class="admin-card"><h3>Всего броней</h3><p class="value">${total}</p></div>
    <div class="admin-card"><h3>На подтверждении</h3><p class="value">${pending}</p></div>
    <div class="admin-card"><h3>Подтверждено</h3><p class="value">${confirmed}</p></div>
    <div class="admin-card"><h3>Отменено</h3><p class="value">${cancelled}</p></div>
    <div class="admin-card"><h3>Пользователей</h3><p class="value">${usersCount || 0}</p></div>
  `;

  if (adminBookingList) {
    if (!data || data.length === 0) {
      adminBookingList.innerHTML = `<div class="empty-state"><p>Броней нет.</p></div>`;
    } else {
      adminBookingList.innerHTML = data.map((b) => `
        <article class="booking-card" tabindex="0" data-booking-id="${b.id}">
          <h2>№${b.id}. ${escapeHtml(b.rooms?.name || "—")}</h2>
          <div class="meta">
            <span>${escapeHtml(b.booking_date)}</span>
            <span>${escapeHtml(b.start_time)}–${escapeHtml(b.end_time)}</span>
            <span class="status">${escapeHtml(b.status)}</span>
            <span>${escapeHtml(b.profiles?.email || "—")}</span>
          </div>
        </article>
      `).join("");
    }
  }

  await loadAdminUsers();

  const statuses = ["На подтверждении", "Подтверждено", "Отменено"];
  const statusCounts = statuses.map((s) => data.filter((b) => b.status === s).length);

  const ctx1 = document.getElementById("chartStatuses");
  if (ctx1) {
    if (chartStatusesInstance) chartStatusesInstance.destroy();
    chartStatusesInstance = new Chart(ctx1, {
      type: "bar",
      data: {
        labels: statuses,
        datasets: [{
          label: "Количество",
          data: statusCounts,
          backgroundColor: ["#f0b429", "#2f9e44", "#c92a2a"]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  const roomMap = {};
  data.forEach((b) => {
    const name = b.rooms?.name || "—";
    roomMap[name] = (roomMap[name] || 0) + 1;
  });
  const roomLabels = Object.keys(roomMap);
  const roomValues = roomLabels.map((n) => roomMap[n]);

  const ctx2 = document.getElementById("chartRooms");
  if (ctx2) {
    if (chartRoomsInstance) chartRoomsInstance.destroy();
    chartRoomsInstance = new Chart(ctx2, {
      type: "bar",
      data: {
        labels: roomLabels,
        datasets: [{
          label: "Броней",
          data: roomValues,
          backgroundColor: "#1a1a1a"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }
}

adminStatusFilter?.addEventListener("change", loadAdmin);

adminBookingList?.addEventListener("click", (e) => {
  const card = e.target.closest("[data-booking-id]");
  if (card) openBooking(Number(card.dataset.bookingId));
});

// ============ ADMIN: ПОЛЬЗОВАТЕЛИ ============
async function loadAdminUsers() {
  const container = adminUsersList;
  if (!container) return;

  container.innerHTML = `<p>Загрузка пользователей...</p>`;

  const { data: users, error: usersErr } = await db
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .order("created_at", { ascending: false });

  if (usersErr) {
    console.error("users load error:", usersErr);
    container.innerHTML = `<p>Ошибка загрузки пользователей: ${escapeHtml(usersErr.message)}</p>`;
    return;
  }

  const { data: bookings, error: bErr } = await db
    .from("bookings")
    .select("id, user_id");

  if (bErr) console.warn("bookings count error:", bErr);

  const countByUser = {};
  (bookings || []).forEach((b) => {
    if (b.user_id) countByUser[b.user_id] = (countByUser[b.user_id] || 0) + 1;
  });

  if (!users || users.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>Пользователей нет.</p></div>`;
    return;
  }

  container.innerHTML = users.map((u) => {
    const isAdmin = u.role === "admin";
    const bookingsCount = countByUser[u.id] || 0;
    const regDate = u.created_at
      ? new Date(u.created_at).toLocaleString("ru-RU")
      : "—";

    return `
      <div class="user-card" data-user-id="${u.id}">
        <div class="user-main">
          <p class="user-name">${escapeHtml(u.full_name || "—")}</p>
          <p class="user-email">${escapeHtml(u.email || "—")}</p>
        </div>
        <div class="user-meta">
          <span class="user-badge ${isAdmin ? "admin" : ""}">${isAdmin ? "Администратор" : "Пользователь"}</span>
          <span class="user-count">Броней: ${bookingsCount}</span>
          <span>Регистрация: ${escapeHtml(regDate)}</span>
        </div>
        <span class="user-arrow">›</span>
      </div>
    `;
  }).join("");
}

adminUsersList?.addEventListener("click", (e) => {
  const card = e.target.closest("[data-user-id]");
  if (card) openUserProfile(card.dataset.userId);
});

// ============ ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ ============
async function openUserProfile(userId) {
  if (!userId) return;

  const container = userProfileContainer;
  if (!container) return;

  container.innerHTML = `<p>Загрузка профиля...</p>`;
  navigate("userProfilePage");

  const { data: profile, error: pErr } = await db
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (pErr || !profile) {
    console.error("profile load error:", pErr);
    container.innerHTML = `<p>Пользователь не найден.</p>`;
    return;
  }

  const { data: bookings, error: bErr } = await db
    .from("bookings")
    .select(`
      id, booking_date, start_time, end_time, purpose, status, created_at,
      rooms (name, building)
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (bErr) console.warn("user bookings error:", bErr);

  const isAdmin = profile.role === "admin";
  const regDate = profile.created_at
    ? new Date(profile.created_at).toLocaleString("ru-RU")
    : "—";

  const total = (bookings || []).length;
  const pending = (bookings || []).filter((b) => b.status === "На подтверждении").length;
  const confirmed = (bookings || []).filter((b) => b.status === "Подтверждено").length;
  const cancelled = (bookings || []).filter((b) => b.status === "Отменено").length;

  const bookingCards = (bookings || []).length === 0
    ? `<div class="empty-state"><p>Броней у этого пользователя пока нет.</p></div>`
    : (bookings || []).map((b) => `
        <article class="booking-card" tabindex="0" data-booking-id="${b.id}">
          <h2>№${b.id}. ${escapeHtml(b.rooms?.name || "—")}</h2>
          <div class="meta">
            <span>${escapeHtml(b.booking_date)}</span>
            <span>${escapeHtml(b.start_time)}–${escapeHtml(b.end_time)}</span>
            <span class="status">${escapeHtml(b.status)}</span>
          </div>
        </article>
      `).join("");

  container.innerHTML = `
    <div class="detail-card">
      <h1>${escapeHtml(profile.full_name || "—")}</h1>
      <p><strong>Email:</strong> ${escapeHtml(profile.email || "—")}</p>
      <p><strong>Роль:</strong> <span class="status">${isAdmin ? "Администратор" : "Пользователь"}</span></p>
      <p><strong>Дата регистрации:</strong> ${escapeHtml(regDate)}</p>
      <p><strong>ID:</strong> ${escapeHtml(profile.id)}</p>
    </div>

    <div class="admin-grid" style="margin-top:20px;">
      <div class="admin-card"><h3>Всего броней</h3><p class="value">${total}</p></div>
      <div class="admin-card"><h3>На подтверждении</h3><p class="value">${pending}</p></div>
      <div class="admin-card"><h3>Подтверждено</h3><p class="value">${confirmed}</p></div>
      <div class="admin-card"><h3>Отменено</h3><p class="value">${cancelled}</p></div>
    </div>

    <h2 style="margin-top: 40px;">Брони пользователя</h2>
    <div>${bookingCards}</div>
  `;

  container.querySelectorAll("[data-booking-id]").forEach((el) => {
    el.addEventListener("click", () => openBooking(Number(el.dataset.bookingId)));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openBooking(Number(el.dataset.bookingId));
      }
    });
  });
}

backToAdminButton?.addEventListener("click", () => {
  navigate("adminPage");
});

// ============ UTIL ============
function escapeHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ============ INIT ============
(async function init() {
  showAnonymousUI();

  const { data: { session } } = await db.auth.getSession();
  if (!session) return;

  try {
    const profile = await ensureProfile(session.user);
    setLoggedIn(session.user, profile);
  } catch (err) {
    console.error("init error:", err);
    setLoggedIn(session.user, {
      id: session.user.id,
      email: session.user.email,
      full_name: session.user.email.split("@")[0],
      role: "user"
    });
  }
})();