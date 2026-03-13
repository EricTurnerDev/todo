"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let todos      = [];   // mirror of server todo list
let categories = [];   // mirror of server category list
let activeCategoryId = null;   // null = "All"
let showInactive     = false;  // whether to include paused recurring todos

// ─────────────────────────────────────────────────────────────────────────────
// Preferences — persisted in localStorage, keyed per user
// ─────────────────────────────────────────────────────────────────────────────

const PREFS_KEY = `todo-prefs-${document.body.dataset.userId}`;

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      showInactive,
      sortValue:        document.getElementById("sort-select").value,
      activeCategoryId,
    }));
  } catch { /* storage unavailable */ }
}

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; }
  catch { return {}; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Category colors  (8 distinct palette entries, chosen per-category)
// ─────────────────────────────────────────────────────────────────────────────

const CAT_PALETTE = [
  { bg: "#eff6ff", text: "#2563eb", border: "#bfdbfe" },  // blue
  { bg: "#fdf4ff", text: "#9333ea", border: "#e9d5ff" },  // purple
  { bg: "#fff7ed", text: "#ea580c", border: "#fed7aa" },  // orange
  { bg: "#f0fdf4", text: "#16a34a", border: "#bbf7d0" },  // green
  { bg: "#fef2f2", text: "#dc2626", border: "#fecaca" },  // red
  { bg: "#fffbeb", text: "#d97706", border: "#fde68a" },  // amber
  { bg: "#f0f9ff", text: "#0284c7", border: "#bae6fd" },  // sky
  { bg: "#fdf2f8", text: "#db2777", border: "#fbcfe8" },  // pink
];

const CAT_COLOR_NAMES = ["Blue", "Purple", "Orange", "Green", "Red", "Amber", "Sky", "Pink"];

// Returns the inline style string for a given palette index (0–7).
function catStyle(colorIdx) {
  const c = CAT_PALETTE[colorIdx % CAT_PALETTE.length];
  return `background:${c.bg};color:${c.text};border:1px solid ${c.border}`;
}

// Looks up the stored color index for a category by ID.
function catColor(categoryId) {
  const cat = categories.find((c) => c.id === categoryId);
  return cat ? (cat.color ?? 0) : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Redirect to login on session expiry; returns true if the caller should abort.
function handleUnauthorized(res) {
  if (res && res.status === 401) {
    window.location.href = "/login";
    return true;
  }
  return false;
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.appendChild(document.createTextNode(str || ""));
  return d.innerHTML;
}

function showError(msg) { alert("Error: " + msg); }

function recurrenceLabel(todo) {
  switch (todo.recurrence_type) {
    case "daily":   return "Daily";
    case "weekly":  return "Weekly";
    case "monthly": return "Monthly";
    case "yearly":  return "Yearly";
    case "custom":
      return `Every ${todo.recurrence_days} day${todo.recurrence_days === 1 ? "" : "s"}`;
    default: return "";
  }
}

function readRecurrence(prefix) {
  const type = document.getElementById(`${prefix}recurrence`).value || null;
  const days = type === "custom"
    ? (parseInt(document.getElementById(`${prefix}recurrence-days`).value, 10) || null)
    : null;
  return { recurrence_type: type, recurrence_days: days };
}

function bindRecurrenceSelect(prefix) {
  const sel   = document.getElementById(`${prefix}recurrence`);
  const group = document.getElementById(`${prefix}recurrence-days-group`);
  sel.addEventListener("change", () => {
    group.style.display = sel.value === "custom" ? "" : "none";
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Categories — load, render, manage
// ─────────────────────────────────────────────────────────────────────────────

async function loadCategories() {
  try {
    const res = await fetch("/api/categories");
    if (handleUnauthorized(res)) return;
    categories = await res.json();
    // Reset the saved filter if the category no longer exists.
    if (activeCategoryId !== null && !categories.find((c) => c.id === activeCategoryId)) {
      activeCategoryId = null;
      savePrefs();
    }
    renderCategoryChips();
    renderCategoryFilter();
    populateCategorySelects();
  } catch (err) {
    console.error("Failed to load categories:", err);
  }
}

/** Renders the management chips inside #category-chips. */
function renderCategoryChips() {
  const el = document.getElementById("category-chips");
  if (categories.length === 0) {
    el.innerHTML = '<span class="no-categories">No categories yet.</span>';
    return;
  }
  el.innerHTML = categories.map((c) => `
    <span class="cat-chip" style="${catStyle(c.color ?? 0)}">
      <button class="cat-color-dot"
              style="background:${CAT_PALETTE[c.color ?? 0].text}"
              onclick="toggleColorPicker(${c.id}, this)"
              title="Change color"></button>
      ${escapeHtml(c.name)}
      <button class="cat-chip-delete"
              onclick="deleteCategory(${c.id})"
              title="Delete category">&times;</button>
    </span>
  `).join("");
}

/**
 * Renders the "All / Cat1 / Cat2 …" filter buttons above the todo list.
 * Hides the bar entirely when there are no categories.
 */
function renderCategoryFilter() {
  const bar = document.getElementById("category-filter-bar");
  if (categories.length === 0) {
    bar.style.display = "none";
    return;
  }
  bar.style.display = "";

  const allActive = activeCategoryId === null;
  const allBtn = `<button class="cat-filter-btn${allActive ? " active" : ""}"
                          onclick="setFilter(null)">All</button>`;
  const catBtns = categories.map((c) => {
    const active = activeCategoryId === c.id;
    return `<button class="cat-filter-btn${active ? " active" : ""}"
                    style="${active ? catStyle(c.color ?? 0) : ""}"
                    onclick="setFilter(${c.id})">${escapeHtml(c.name)}</button>`;
  }).join("");

  bar.innerHTML = allBtn + catBtns;
}

/** Updates the <option> lists in the add-form and edit-modal category selects. */
function populateCategorySelects() {
  ["new-category", "edit-category"].forEach((id) => {
    const sel = document.getElementById(id);
    // Remove all options except the first ("No category")
    while (sel.options.length > 1) sel.remove(1);
    categories.forEach((c) => {
      const opt = new Option(c.name, c.id);
      sel.add(opt);
    });
  });
}

function setFilter(categoryId) {
  activeCategoryId = categoryId;
  savePrefs();
  renderCategoryFilter();
  loadTodos();
}

// ── New-category color selection ─────────────────────────────────────────────

let newCategoryColor = 0;

function renderNewCategoryColorPicker() {
  const el = document.getElementById("new-cat-color-swatches");
  el.innerHTML = CAT_PALETTE.map((c, i) =>
    `<button type="button"
             class="color-swatch-btn${i === newCategoryColor ? " selected" : ""}"
             style="background:${c.text}"
             onclick="selectNewCategoryColor(${i})"
             title="${CAT_COLOR_NAMES[i]}"></button>`
  ).join("");
}

function selectNewCategoryColor(idx) {
  newCategoryColor = idx;
  renderNewCategoryColorPicker();
}

// ── Floating color-picker popup (for editing existing chip colors) ─────────────

let colorPickerTargetId = null;

function toggleColorPicker(catId, btn) {
  const existing = document.getElementById("color-picker-popup");
  if (existing && colorPickerTargetId === catId) {
    closeColorPicker();
    return;
  }
  closeColorPicker();
  colorPickerTargetId = catId;

  const popup = document.createElement("div");
  popup.id        = "color-picker-popup";
  popup.className = "color-picker-popup";
  popup.innerHTML = CAT_PALETTE.map((c, i) =>
    `<button class="color-swatch-btn"
             style="background:${c.text}"
             onclick="applyColor(${catId}, ${i})"
             title="${CAT_COLOR_NAMES[i]}"></button>`
  ).join("");

  const rect = btn.getBoundingClientRect();
  popup.style.top  = (rect.bottom + window.scrollY + 4) + "px";
  popup.style.left = rect.left + "px";
  document.body.appendChild(popup);

  setTimeout(() => document.addEventListener("click", closeColorPickerOnOutside), 0);
}

function closeColorPickerOnOutside(e) {
  const popup = document.getElementById("color-picker-popup");
  if (!popup) return;
  if (!popup.contains(e.target)) {
    closeColorPicker();
  } else {
    document.addEventListener("click", closeColorPickerOnOutside, { once: true });
  }
}

function closeColorPicker() {
  document.getElementById("color-picker-popup")?.remove();
  colorPickerTargetId = null;
  document.removeEventListener("click", closeColorPickerOnOutside);
}

async function applyColor(catId, colorIdx) {
  closeColorPicker();
  const res = await fetch(`/api/categories/${catId}/color`, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ color: colorIdx }),
  });
  if (handleUnauthorized(res)) return;
  if (res.ok) {
    await loadCategories();
    loadTodos();
  } else {
    showError("Could not update color");
  }
}

// ── Add category form ─────────────────────────────────────────────────────────

document.getElementById("add-category-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("new-category-name");
  const name  = input.value.trim();
  if (!name) return;

  const res = await fetch("/api/categories", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ name, color: newCategoryColor }),
  });

  if (handleUnauthorized(res)) return;
  if (res.ok) {
    input.value      = "";
    newCategoryColor = 0;
    renderNewCategoryColorPicker();
    await loadCategories();   // refresh chips, filter bar, and selects
    loadTodos();
  } else {
    const err = await res.json();
    showError(err.error || "Could not create category");
  }
});

async function deleteCategory(id) {
  if (!confirm("Delete this category? Todos in it will become uncategorized.")) return;

  const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
  if (handleUnauthorized(res)) return;
  if (res.ok) {
    // If the deleted category was the active filter, reset to "All"
    if (activeCategoryId === id) activeCategoryId = null;
    await loadCategories();
    loadTodos();
  } else {
    showError("Could not delete category");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Encouragement banner — shown when overdue tasks are detected
// ─────────────────────────────────────────────────────────────────────────────

const ENCOURAGEMENT_QUOTES = [
  { text: "The secret of getting ahead is getting started.",                                       attr: "Mark Twain" },
  { text: "You don't have to be great to start, but you have to start to be great.",               attr: "Zig Ziglar" },
  { text: "A year from now you may wish you had started today.",                                   attr: "Karen Lamb" },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.",          attr: "Chinese Proverb" },
  { text: "It always seems impossible until it's done.",                                           attr: "Nelson Mandela" },
  { text: "Start where you are. Use what you have. Do what you can.",                              attr: "Arthur Ashe" },
  { text: "The way to get started is to quit talking and begin doing.",                            attr: "Walt Disney" },
  { text: "You don't have to see the whole staircase, just take the first step.",                  attr: "Martin Luther King Jr." },
  { text: "Small deeds done are better than great deeds planned.",                                 attr: "Peter Marshall" },
  { text: "Done is better than perfect.",                                                          attr: "Sheryl Sandberg" },
  { text: "Do it now. Sometimes \u2018later\u2019 becomes \u2018never\u2019.",                     attr: null },
  { text: "Action is the antidote to despair.",                                                    attr: "Joan Baez" },
];

let encouragementDismissed = false;

function maybeShowEncouragement() {
  const banner = document.getElementById("encouragement-banner");
  if (encouragementDismissed) { banner.style.display = "none"; return; }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdue = todos.filter((t) => {
    if (!t.due_at || t.completed || !t.active) return false;
    const [y, m, d] = t.due_at.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d) < today;
  });

  if (overdue.length === 0) { banner.style.display = "none"; return; }

  const q        = ENCOURAGEMENT_QUOTES[Math.floor(Math.random() * ENCOURAGEMENT_QUOTES.length)];
  const count    = overdue.length;
  const taskWord = count === 1 ? "task" : "tasks";
  const cite     = q.attr ? ` <cite>\u2014 ${escapeHtml(q.attr)}</cite>` : "";

  banner.innerHTML = `
    <div class="encouragement-body">
      <p class="encouragement-nudge">You have ${count} overdue ${taskWord} \u2014 here\u2019s some motivation:</p>
      <blockquote class="encouragement-quote">\u201c${escapeHtml(q.text)}\u201d${cite}</blockquote>
    </div>
    <button class="encouragement-close" onclick="dismissEncouragement()" aria-label="Dismiss">&times;</button>
  `;
  banner.style.display = "";
}

function dismissEncouragement() {
  encouragementDismissed = true;
  document.getElementById("encouragement-banner").style.display = "none";
}

// ─────────────────────────────────────────────────────────────────────────────
// Todos — load and render
// ─────────────────────────────────────────────────────────────────────────────

async function loadTodos() {
  const sortVal = document.getElementById("sort-select").value;
  const [sortKey, sortDir] = sortVal.split("_");
  const col = sortKey === "due" ? "due_at" : "created_at";

  let url = `/api/todos?sort=${col}&order=${sortDir}`;
  if (activeCategoryId !== null) url += `&category_id=${activeCategoryId}`;
  if (showInactive)              url += `&show_inactive=true`;

  try {
    const res = await fetch(url);
    if (handleUnauthorized(res)) return;
    if (!res.ok) throw new Error("Server returned " + res.status);
    todos = await res.json();
    renderTodos();
  } catch (err) {
    document.getElementById("todo-list").innerHTML =
      `<p class="empty" style="color:#ef4444;">Failed to load todos: ${escapeHtml(err.message)}</p>`;
  }
}

function renderTodos() {
  const list = document.getElementById("todo-list");
  list.innerHTML = todos.length === 0
    ? '<p class="empty">No to-dos here — add one above!</p>'
    : todos.map(renderTodoItem).join("");
  maybeShowEncouragement();
}

function renderTodoItem(todo) {
  const addedDate = todo.created_at ? new Date(todo.created_at).toLocaleString() : "";

  let dueBadge = "";
  if (todo.due_at) {
    const [y, m, d] = todo.due_at.slice(0, 10).split("-").map(Number);
    const due     = new Date(y, m - 1, d);
    const today   = new Date(); today.setHours(0, 0, 0, 0);
    const overdue = !todo.completed && todo.active && due < today;
    const label   = due.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    dueBadge = `<span class="due-badge${overdue ? " overdue" : ""}">Due ${label}</span>`;
  }

  let recurrenceBadge = "";
  if (todo.recurrence_type) {
    let lastDone = "";
    if (todo.last_done_at) {
      const [y, m, d] = todo.last_done_at.slice(0, 10).split("-").map(Number);
      lastDone = " · Last done " + new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    }
    recurrenceBadge = `<span class="recurrence-badge">↻ ${recurrenceLabel(todo)}${lastDone}</span>`;
  }

  let catBadge = "";
  if (todo.category_name) {
    catBadge = `<span class="cat-badge" style="${catStyle(catColor(todo.category_id))}">${escapeHtml(todo.category_name)}</span>`;
  }

  let pausedBadge = "";
  if (!todo.active) {
    pausedBadge = `<span class="paused-badge">Paused</span>`;
  }

  // Pause / Resume button — only shown for recurring todos
  let pauseBtn = "";
  if (todo.recurrence_type) {
    pauseBtn = todo.active
      ? `<button class="btn btn-sm btn-pause" onclick="setActive(${todo.id}, false)" title="Pause until next season">⏸</button>`
      : `<button class="btn btn-sm btn-resume" onclick="setActive(${todo.id}, true)" title="Resume this recurring todo">▶</button>`;
  }

  const itemClass = ["todo-item",
                     todo.completed ? "completed" : "",
                     !todo.active   ? "paused"    : ""].filter(Boolean).join(" ");

  return `
    <div class="${itemClass}" id="todo-${todo.id}">
      <label class="todo-check">
        <input type="checkbox" ${todo.completed ? "checked" : ""}
               ${!todo.active ? "disabled" : ""}
               onchange="onTodoCheck(${todo.id}, this)">
      </label>
      <div class="todo-body">
        <div class="todo-title">${escapeHtml(todo.title)}</div>
        ${todo.description ? `<div class="todo-desc">${escapeHtml(todo.description)}</div>` : ""}
        <div class="todo-meta">
          ${catBadge}${dueBadge}${recurrenceBadge}${pausedBadge}
          <span>Added ${addedDate}</span>
        </div>
      </div>
      <div class="todo-actions">
        ${pauseBtn}
        <button class="btn btn-sm btn-edit"   onclick="openEditModal(${todo.id})">Edit</button>
        <button class="btn btn-sm btn-delete" onclick="deleteTodo(${todo.id})">Delete</button>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pause / Resume
// ─────────────────────────────────────────────────────────────────────────────

async function setActive(id, active) {
  const res = await fetch(`/api/todos/${id}/active`, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ active }),
  });
  if (handleUnauthorized(res)) return;
  if (res.ok) loadTodos();
  else showError("Could not update to-do");
}

// ─────────────────────────────────────────────────────────────────────────────
// Sort + show-inactive toggle
// ─────────────────────────────────────────────────────────────────────────────

document.getElementById("sort-select").addEventListener("change", () => {
  savePrefs();
  loadTodos();
});

document.getElementById("show-inactive").addEventListener("change", (e) => {
  showInactive = e.target.checked;
  savePrefs();
  loadTodos();
});

// ─────────────────────────────────────────────────────────────────────────────
// Create todo
// ─────────────────────────────────────────────────────────────────────────────

document.getElementById("add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const titleEl = document.getElementById("new-title");
  const title   = titleEl.value.trim();
  if (!title) return;

  const catVal = document.getElementById("new-category").value;
  const body = {
    title,
    description: document.getElementById("new-description").value.trim() || null,
    category_id: catVal ? parseInt(catVal, 10) : null,
    due_at:      document.getElementById("new-due-at").value || null,
    ...readRecurrence("new-"),
  };

  const res = await fetch("/api/todos", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (handleUnauthorized(res)) return;
  if (res.ok) {
    titleEl.value = "";
    document.getElementById("new-description").value = "";
    document.getElementById("new-category").value    = "";
    document.getElementById("new-due-at").value      = "";
    document.getElementById("new-recurrence").value  = "";
    document.getElementById("new-recurrence-days-group").style.display = "none";
    titleEl.focus();
    loadTodos();
  } else {
    const err = await res.json();
    showError(err.error || "Could not create to-do");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Confetti burst — fired when a to-do is checked off
// ─────────────────────────────────────────────────────────────────────────────

const CONFETTI_COLORS = ["#4f46e5","#7c3aed","#db2777","#ea580c","#16a34a","#d97706","#0284c7","#dc2626"];

function triggerConfetti(el) {
  const rect = el.getBoundingClientRect();
  const cx   = rect.left + rect.width  / 2;
  const cy   = rect.top  + rect.height / 2;

  // Host sits in fixed coords so no scroll adjustment needed.
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:visible;";
  document.body.appendChild(host);

  const COUNT     = 22;
  const particles = [];

  for (let i = 0; i < COUNT; i++) {
    const p     = document.createElement("div");
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    const size  = 5 + Math.random() * 5;
    // Spread evenly around the circle with a little jitter.
    const angle = (i / COUNT) * 2 * Math.PI + (Math.random() - 0.5) * 0.5;
    const dist  = 30 + Math.random() * 38;
    const dx    = Math.cos(angle) * dist;
    const dy    = Math.sin(angle) * dist;
    const rot   = Math.random() * 540 - 270;

    p.style.cssText = [
      "position:absolute",
      `left:${cx}px`, `top:${cy}px`,
      `width:${size}px`, `height:${size}px`,
      `background:${color}`,
      `border-radius:${Math.random() > 0.4 ? "50%" : "2px"}`,
      "transform:translate(-50%,-50%)",
      "opacity:1",
      "transition:transform .55s cubic-bezier(.2,.8,.4,1),opacity .55s ease-out",
    ].join(";");

    host.appendChild(p);
    particles.push({ el: p, dx, dy, rot });
  }

  // Double-rAF: let the browser paint the start state before transitioning.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    particles.forEach(({ el: p, dx, dy, rot }) => {
      p.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${rot}deg)`;
      p.style.opacity   = "0";
    });
  }));

  setTimeout(() => host.remove(), 650);
}

// ─────────────────────────────────────────────────────────────────────────────
// Toggle
// ─────────────────────────────────────────────────────────────────────────────

function onTodoCheck(id, checkbox) {
  if (checkbox.checked) triggerConfetti(checkbox);
  toggleTodo(id);
}

async function toggleTodo(id) {
  const res = await fetch(`/api/todos/${id}/toggle`, { method: "PATCH" });
  if (handleUnauthorized(res)) return;
  loadTodos();
  if (!res.ok) showError("Could not update to-do");
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit modal
// ─────────────────────────────────────────────────────────────────────────────

function openEditModal(id) {
  const todo = todos.find((t) => t.id === id);
  if (!todo) return;

  document.getElementById("edit-id").value          = id;
  document.getElementById("edit-title").value       = todo.title;
  document.getElementById("edit-description").value = todo.description || "";
  document.getElementById("edit-category").value    = todo.category_id ?? "";
  document.getElementById("edit-due-at").value      = todo.due_at ? todo.due_at.slice(0, 10) : "";

  const rtype = todo.recurrence_type || "";
  document.getElementById("edit-recurrence").value       = rtype;
  document.getElementById("edit-recurrence-days").value  = rtype === "custom" ? (todo.recurrence_days || "") : "";
  document.getElementById("edit-recurrence-days-group").style.display = rtype === "custom" ? "" : "none";

  const modal = document.getElementById("edit-modal");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.getElementById("edit-title").focus();
}

function closeEditModal() {
  document.getElementById("edit-modal").classList.remove("open");
  document.getElementById("edit-modal").setAttribute("aria-hidden", "true");
}

document.getElementById("save-edit").addEventListener("click", async () => {
  const id    = parseInt(document.getElementById("edit-id").value, 10);
  const title = document.getElementById("edit-title").value.trim();
  if (!title) { showError("Title is required"); return; }

  const current = todos.find((t) => t.id === id);
  const catVal  = document.getElementById("edit-category").value;
  const body = {
    title,
    description: document.getElementById("edit-description").value.trim() || null,
    completed:   current ? current.completed : false,
    category_id: catVal ? parseInt(catVal, 10) : null,
    due_at:      document.getElementById("edit-due-at").value || null,
    ...readRecurrence("edit-"),
  };

  const res = await fetch(`/api/todos/${id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (handleUnauthorized(res)) return;
  if (res.ok) { closeEditModal(); loadTodos(); }
  else { const err = await res.json(); showError(err.error || "Could not update to-do"); }
});

document.getElementById("cancel-edit").addEventListener("click", closeEditModal);
document.getElementById("edit-modal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeEditModal();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeEditModal(); });

// ─────────────────────────────────────────────────────────────────────────────
// Delete todo
// ─────────────────────────────────────────────────────────────────────────────

async function deleteTodo(id) {
  if (!confirm("Delete this to-do? This cannot be undone.")) return;
  const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
  if (handleUnauthorized(res)) return;
  if (res.ok) loadTodos();
  else showError("Could not delete to-do");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────────────────────────────────────

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("tab-btn--active"));
    document.querySelectorAll(".tab-panel").forEach((p) => { p.style.display = "none"; });
    btn.classList.add("tab-btn--active");
    document.getElementById(btn.dataset.tab).style.display = "";
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Page-level navigation  ("To-Dos" ↔ "Insights")
// ─────────────────────────────────────────────────────────────────────────────
//
// Uses .nav-btn / .nav-btn--active — distinct from the inner .tab-btn so the
// two handlers don't interfere with each other.

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("nav-btn--active"));
    btn.classList.add("nav-btn--active");

    const section = btn.dataset.section;
    document.getElementById("todos-section").style.display      = section === "todos"     ? "" : "none";
    document.getElementById("insights-section").style.display  = section === "insights" ? "" : "none";

    if (section === "insights") loadInsights();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Insights — data loading
// ─────────────────────────────────────────────────────────────────────────────

async function loadInsights() {
  const el = document.getElementById("insights-section");
  el.innerHTML = '<p class="loading">Loading insights\u2026</p>';

  try {
    const res = await fetch("/api/insights");
    if (handleUnauthorized(res)) return;
    if (!res.ok) throw new Error("Server returned " + res.status);
    const data = await res.json();
    el.innerHTML = renderInsights(data);
  } catch (err) {
    el.innerHTML =
      `<p class="empty" style="color:#ef4444">Failed to load insights: ${escapeHtml(err.message)}</p>`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Insights — chart helpers (pure SVG, no dependencies)
// ─────────────────────────────────────────────────────────────────────────────

const CHART_W = 580;

/**
 * Vertical bar chart.
 * data       — array of objects
 * valKey     — key for the numeric value
 * labelFn    — function(d, i) → tooltip label string
 * color      — bar fill colour
 * height     — chart height in px (bars only; does not include label area)
 */
function svgBars(data, { valKey = "count", labelFn, color = "#4f46e5", height = 100 } = {}) {
  if (!data.length) return '<p class="chart-empty">No data yet.</p>';

  const maxVal = Math.max(...data.map((d) => d[valKey]), 1);
  const PAD = 1;
  const bw  = Math.floor((CHART_W - PAD) / data.length);
  const H   = height;

  const bars = data.map((d, i) => {
    const bh    = Math.max(Math.round((d[valKey] / maxVal) * (H - 4)), d[valKey] > 0 ? 1 : 0);
    const x     = i * bw + PAD;
    const y     = H - bh;
    const label = labelFn ? labelFn(d, i) : String(d[valKey]);
    return `<rect x="${x}" y="${y}" width="${Math.max(bw - 1, 1)}" height="${bh}"
                  fill="${color}" rx="1"><title>${escapeHtml(label)}</title></rect>`;
  }).join("");

  return `<div class="chart-wrap">
    <svg viewBox="0 0 ${CHART_W} ${H}" preserveAspectRatio="none"
         style="width:100%;height:${H}px;display:block">${bars}</svg>
  </div>`;
}

/**
 * Grouped vertical bar chart for two series shown side-by-side.
 * Each element of data must have keys aKey and bKey.
 */
function svgDualBars(data, { aKey, bKey, aColor = "#94a3b8", bColor = "#4f46e5",
                              aLabel = "A", bLabel = "B", height = 100,
                              labelFn } = {}) {
  if (!data.length) return '<p class="chart-empty">No data yet.</p>';

  const maxVal = Math.max(...data.map((d) => Math.max(d[aKey] || 0, d[bKey] || 0)), 1);
  const groupW = Math.floor((CHART_W - 1) / data.length);
  const bw     = Math.max(Math.floor(groupW / 2) - 1, 1);
  const H      = height;

  const bars = data.map((d, i) => {
    const gx  = i * groupW + 1;
    const bh1 = Math.max(Math.round(((d[aKey] || 0) / maxVal) * (H - 4)), (d[aKey] || 0) > 0 ? 1 : 0);
    const bh2 = Math.max(Math.round(((d[bKey] || 0) / maxVal) * (H - 4)), (d[bKey] || 0) > 0 ? 1 : 0);
    const tip = labelFn ? labelFn(d, i) : d.day || "";
    return `
      <rect x="${gx}" y="${H - bh1}" width="${bw}" height="${bh1}"
            fill="${aColor}" rx="1"><title>${escapeHtml(tip)} — ${aLabel}: ${d[aKey] || 0}</title></rect>
      <rect x="${gx + bw + 1}" y="${H - bh2}" width="${bw}" height="${bh2}"
            fill="${bColor}" rx="1"><title>${escapeHtml(tip)} — ${bLabel}: ${d[bKey] || 0}</title></rect>`;
  }).join("");

  const legend = `
    <div class="chart-legend">
      <span class="legend-dot" style="background:${aColor}"></span>${escapeHtml(aLabel)}
      <span class="legend-dot" style="background:${bColor}"></span>${escapeHtml(bLabel)}
    </div>`;

  return `<div class="chart-wrap">
    <svg viewBox="0 0 ${CHART_W} ${H}" preserveAspectRatio="none"
         style="width:100%;height:${H}px;display:block">${bars}</svg>
  </div>${legend}`;
}

/**
 * Horizontal bar chart — useful for labelled buckets.
 * data    — array of { label, count } objects (already in desired display order)
 * color   — single colour or array of colours
 */
function hbarChart(data, { color = "#4f46e5" } = {}) {
  if (!data.length) return '<p class="chart-empty">No data yet.</p>';

  const maxVal = Math.max(...data.map((d) => d.count), 1);
  const colors = Array.isArray(color) ? color : data.map(() => color);

  return data.map((d, i) => {
    const pct = Math.round((d.count / maxVal) * 100);
    return `<div class="hbar-row">
      <span class="hbar-label">${escapeHtml(d.label)}</span>
      <div class="hbar-track">
        <div class="hbar-fill" style="width:${pct}%;background:${colors[i % colors.length]}"></div>
      </div>
      <span class="hbar-value">${d.count}</span>
    </div>`;
  }).join("");
}

// ─────────────────────────────────────────────────────────────────────────────
// Insights — data helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns an array of YYYY-MM-DD strings for the last `n` days (today last). */
function lastNDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

/** Returns an array of YYYY-MM-DD week-start strings for the last `n` weeks. */
function lastNWeekStarts(n) {
  const weeks = [];
  // Find the most recent Monday
  const today = new Date();
  const dow   = today.getDay();           // 0=Sun…6=Sat
  const daysSinceMon = (dow + 6) % 7;    // days since last Monday
  const latestMon = new Date(today);
  latestMon.setDate(today.getDate() - daysSinceMon);

  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(latestMon);
    d.setDate(latestMon.getDate() - i * 7);
    weeks.push(d.toISOString().slice(0, 10));
  }
  return weeks;
}

/**
 * Fills sparse day data with zeros so every day in the range has an entry.
 * serverData — array of { day: "YYYY-MM-DD", count: N }
 * days       — array of "YYYY-MM-DD" strings (from lastNDays)
 * Returns array of { day, count }.
 */
function fillDays(serverData, days) {
  const map = {};
  serverData.forEach((d) => { map[d.day] = d.count; });
  return days.map((day) => ({ day, count: map[day] || 0 }));
}

/** Same as fillDays but for week_start key. */
function fillWeeks(serverData, weekStarts) {
  const map = {};
  serverData.forEach((d) => { map[d.week_start] = d.count; });
  return weekStarts.map((ws) => ({ week_start: ws, count: map[ws] || 0 }));
}

/**
 * Joins two day-series (created, completed) into one array with both keys.
 * Returns array of { day, created, completed }.
 */
function joinDaySeries(createdData, completedData, days) {
  const cre = {};
  const com = {};
  createdData.forEach((d)   => { cre[d.day] = d.count; });
  completedData.forEach((d) => { com[d.day] = d.count; });
  return days.map((day) => ({ day, created: cre[day] || 0, completed: com[day] || 0 }));
}

/** Fills all 7 DOW slots (0–6) with zero for missing days. */
function fillDow(serverData) {
  const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const map = {};
  serverData.forEach((d) => { map[d.dow] = d.count; });
  return DOW_SHORT.map((name, i) => ({ label: name, count: map[i] || 0, dow: i }));
}

/** Maps bucket keys to human-readable labels in display order. */
const HISTOGRAM_ORDER = [
  { key: "same_day",    label: "Same day"   },
  { key: "1_3_days",   label: "1–3 days"   },
  { key: "4_7_days",   label: "4–7 days"   },
  { key: "8_30_days",  label: "8–30 days"  },
  { key: "30plus_days", label: "30+ days"  },
];
const HISTOGRAM_COLORS = ["#4f46e5", "#6366f1", "#818cf8", "#a5b4fc", "#c7d2fe"];

function fillHistogram(serverData) {
  const map = {};
  serverData.forEach((d) => { map[d.bucket] = d.count; });
  return HISTOGRAM_ORDER.map((b) => ({ label: b.label, count: map[b.key] || 0 }))
                        .filter((b) => b.count > 0);  // only show non-zero buckets
}

/** Short month-day label for a YYYY-MM-DD string. */
function shortDate(iso) {
  const [, m, d] = iso.split("-");
  return `${parseInt(m)}/${parseInt(d)}`;
}

/** Short week label: "Feb 3" from a YYYY-MM-DD week-start. */
function shortWeek(iso) {
  const dt = new Date(iso + "T00:00:00");
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Insights — insights generator
// ─────────────────────────────────────────────────────────────────────────────

const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function generateInsights(data) {
  const insights = [];
  const s = data.summary;

  // Streak
  if (s.current_streak >= 3) {
    insights.push(`You're on a <strong>${s.current_streak}-day</strong> completion streak — keep it going!`);
  }

  // On-time completion rate (only meaningful with enough data)
  if (s.tracked_with_due_count >= 5) {
    const rate = Math.round((s.on_time_count / s.tracked_with_due_count) * 100);
    if (rate >= 80) {
      insights.push(`You finish <strong>${rate}%</strong> of due-dated tasks on time — great discipline.`);
    } else if (rate < 50) {
      insights.push(`Only <strong>${rate}%</strong> of due-dated tasks are completed on time. Consider adjusting your due dates or priorities.`);
    } else {
      insights.push(`You complete <strong>${rate}%</strong> of due-dated tasks on time.`);
    }
  }

  // Busiest day of week
  const dowFull = fillDow(data.completed_by_dow);
  const totalDow = dowFull.reduce((a, b) => a + b.count, 0);
  if (totalDow >= 7) {
    const best = dowFull.reduce((a, b) => a.count > b.count ? a : b);
    if (best.count > 0) {
      insights.push(`You complete the most tasks on <strong>${DOW_NAMES[best.dow]}s</strong>.`);
    }
  }

  // Average completion time
  if (s.avg_completion_days != null) {
    const d = parseFloat(s.avg_completion_days);
    if (d < 1) {
      insights.push(`Most completed tasks are finished the <strong>same day</strong> they're created.`);
    } else {
      insights.push(`On average, you complete tasks in <strong>${d.toFixed(1)} day${d === 1 ? "" : "s"}</strong> after creating them.`);
    }
  }

  // Backlog trend (compare last 7 days avg vs prior 7 days avg)
  if (data.backlog_per_day.length >= 14) {
    const sizes   = data.backlog_per_day.map((d) => d.backlog_size);
    const recent  = sizes.slice(-7).reduce((a, b) => a + b, 0) / 7;
    const older   = sizes.slice(-14, -7).reduce((a, b) => a + b, 0) / 7;
    if (recent > older * 1.15) {
      insights.push(`Your backlog has <strong>grown</strong> over the last two weeks — you may be creating tasks faster than completing them.`);
    } else if (recent < older * 0.85 && older > 0) {
      insights.push(`Your backlog is <strong>shrinking</strong> — you're completing more than you're adding. Nice work!`);
    }
  }

  // Overdue
  if (s.overdue_count > 0) {
    insights.push(`You have <strong>${s.overdue_count}</strong> overdue task${s.overdue_count === 1 ? "" : "s"} — consider reviewing them.`);
  }

  // Oldest open task
  if (s.oldest_open_days != null && s.oldest_open_days >= 30) {
    insights.push(`Your oldest open task has been waiting for <strong>${Math.round(s.oldest_open_days)}</strong> days.`);
  }

  // No completed tasks yet (new user)
  if (s.completed_count === 0 && s.open_count > 0) {
    insights.push(`You have ${s.open_count} open task${s.open_count === 1 ? "" : "s"}. Complete your first one to start seeing trends!`);
  }

  return insights;
}

// ─────────────────────────────────────────────────────────────────────────────
// Insights — main render function
// ─────────────────────────────────────────────────────────────────────────────

function renderInsights(data) {
  const s    = data.summary;
  const days = lastNDays(30);
  const wks  = lastNWeekStarts(12);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function statCard(value, label, { muted = false, danger = false } = {}) {
    const cls = ["stat-card",
                 muted  ? "stat-card--muted"  : "",
                 danger ? "stat-card--danger"  : ""].filter(Boolean).join(" ");
    return `<div class="${cls}">
      <div class="stat-value">${escapeHtml(String(value))}</div>
      <div class="stat-label">${escapeHtml(label)}</div>
    </div>`;
  }

  function chartSection(title, body, note = "") {
    return `<div class="chart-section card">
      <h2 class="chart-title">${escapeHtml(title)}</h2>
      ${note ? `<p class="chart-note">${note}</p>` : ""}
      ${body}
    </div>`;
  }

  // ── Summary cards ─────────────────────────────────────────────────────────

  const onTimePct = s.tracked_with_due_count > 0
    ? Math.round((s.on_time_count / s.tracked_with_due_count) * 100) + "%"
    : "—";

  const avgDays = s.avg_completion_days != null
    ? parseFloat(s.avg_completion_days) < 1
        ? "< 1 d"
        : parseFloat(s.avg_completion_days).toFixed(1) + " d"
    : "—";

  const streakLabel = s.current_streak > 0 ? s.current_streak + " d" : "0";

  const oldestLabel = s.oldest_open_days != null && s.open_count > 0
    ? Math.round(s.oldest_open_days) + " d"
    : "—";

  const summaryHtml = `
    <div class="stats-grid">
      ${statCard(s.open_count,          "Open")}
      ${statCard(s.completed_count,     "Completed", { muted: true })}
      ${statCard(s.overdue_count,       "Overdue",   { danger: s.overdue_count > 0 })}
      ${statCard(s.due_today_count,     "Due Today")}
    </div>
    <div class="stats-grid">
      ${statCard(s.due_this_week_count, "Due This Week")}
      ${statCard(onTimePct,             "On-Time Rate")}
      ${statCard(avgDays,               "Avg. Completion")}
      ${statCard(streakLabel,           "Streak")}
    </div>
    ${s.open_count > 0 ? `<p class="stat-footnote">Oldest open task: <strong>${oldestLabel} old</strong></p>` : ""}
  `;

  // ── Completed per day (last 30 days) ─────────────────────────────────────

  const completedByDay = fillDays(data.completed_per_day, days);
  const completedDayChart = svgBars(completedByDay, {
    labelFn: (d) => `${shortDate(d.day)}: ${d.count} completed`,
  });

  // ── Created vs completed per day ─────────────────────────────────────────

  const createdByDay  = fillDays(data.created_per_day, days);
  const joinedDays    = joinDaySeries(createdByDay, completedByDay, days);
  const dualChart     = svgDualBars(joinedDays, {
    aKey: "created", bKey: "completed",
    aLabel: "Created", bLabel: "Completed",
    color: "#4f46e5",
    labelFn: (d) => shortDate(d.day),
  });

  // ── Completed per week (last 12 weeks) ────────────────────────────────────

  const completedByWeek = fillWeeks(data.completed_per_week, wks);
  const weekChart = svgBars(completedByWeek, {
    color: "#6366f1",
    labelFn: (d) => `Wk of ${shortWeek(d.week_start)}: ${d.count} completed`,
  });

  // ── Backlog per day ───────────────────────────────────────────────────────

  const backlogChart = svgBars(data.backlog_per_day, {
    valKey:  "backlog_size",
    color:   "#f59e0b",
    labelFn: (d) => `${shortDate(d.day)}: ${d.backlog_size} open`,
  });

  // ── Completion-time histogram ─────────────────────────────────────────────

  const histData  = fillHistogram(data.completion_histogram);
  const histChart = hbarChart(histData, { color: HISTOGRAM_COLORS });

  // ── Completions by day of week ────────────────────────────────────────────

  const dowData  = fillDow(data.completed_by_dow);
  const dowChart = svgBars(dowData, {
    valKey:  "count",
    color:   "#8b5cf6",
    labelFn: (d) => `${DOW_NAMES[d.dow]}: ${d.count} completed`,
  });

  // ── Category table ────────────────────────────────────────────────────────

  let categoryHtml = "";
  if (data.by_category.length > 0) {
    const rows = data.by_category.map((c) => {
      const onTimePctCat = c.tracked_with_due > 0
        ? Math.round((c.on_time_count / c.tracked_with_due) * 100) + "%"
        : "—";
      return `<tr>
        <td><span class="cat-badge" style="${catStyle(c.color ?? 0)}">${escapeHtml(c.name)}</span></td>
        <td class="tnum">${c.total}</td>
        <td class="tnum">${c.completed_count}</td>
        <td class="tnum ${c.overdue_count > 0 ? "text-danger" : ""}">${c.overdue_count}</td>
        <td class="tnum">${onTimePctCat}</td>
      </tr>`;
    }).join("");

    categoryHtml = chartSection("By Category", `
      <table class="insights-table">
        <thead>
          <tr>
            <th>Category</th>
            <th class="tnum">Total</th>
            <th class="tnum">Done</th>
            <th class="tnum">Overdue</th>
            <th class="tnum">On-Time %</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `);
  }

  // ── Insights ──────────────────────────────────────────────────────────────

  const insightsList = generateInsights(data);
  const insightsHtml = insightsList.length > 0
    ? `<ul class="insight-list">${insightsList.map((i) => `<li>${i}</li>`).join("")}</ul>`
    : `<p class="chart-empty">Complete more tasks to unlock insights.</p>`;

  // ── Assemble ──────────────────────────────────────────────────────────────

  const trackedNote =
    "Charts only include tasks completed after the completion-tracking update was applied. " +
    "Pre-existing completed tasks count in summary totals but not in time-series charts.";

  return `<div class="insights">
    ${summaryHtml}
    ${chartSection("Completed — last 30 days", completedDayChart, trackedNote)}
    ${chartSection("Created vs. Completed — last 30 days", dualChart)}
    ${chartSection("Completed — last 12 weeks", weekChart)}
    ${chartSection("Backlog size — last 30 days", backlogChart,
        "Open tasks at the end of each day (includes all tasks regardless of when tracking started).")}
    ${chartSection("How long tasks take to complete", histChart)}
    ${chartSection("Completions by day of week", dowChart)}
    ${categoryHtml}
    <div class="chart-section card">
      <h2 class="chart-title">Insights</h2>
      ${insightsHtml}
    </div>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

bindRecurrenceSelect("new-");
bindRecurrenceSelect("edit-");
renderNewCategoryColorPicker();

document.addEventListener("DOMContentLoaded", async () => {
  // Restore saved preferences before the first data load.
  const prefs = loadPrefs();
  if (prefs.sortValue) {
    document.getElementById("sort-select").value = prefs.sortValue;
  }
  if (prefs.showInactive) {
    showInactive = true;
    document.getElementById("show-inactive").checked = true;
  }
  if (prefs.activeCategoryId !== undefined && prefs.activeCategoryId !== null) {
    activeCategoryId = prefs.activeCategoryId;
  }

  await loadCategories();   // must finish before loadTodos so selects are ready
  loadTodos();
});
