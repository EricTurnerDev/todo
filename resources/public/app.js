"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let todos      = [];   // mirror of server todo list
let categories = [];   // mirror of server category list
let activeCategoryId = null;   // null = "All"
let showInactive     = false;  // whether to include paused recurring todos

// ─────────────────────────────────────────────────────────────────────────────
// Category colors  (8 distinct palette entries, assigned by id % 8)
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

function catStyle(categoryId) {
  const c = CAT_PALETTE[categoryId % CAT_PALETTE.length];
  return `background:${c.bg};color:${c.text};border:1px solid ${c.border}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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
    categories = await res.json();
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
    <span class="cat-chip" style="${catStyle(c.id)}">
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
                    style="${active ? catStyle(c.id) : ""}"
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
  renderCategoryFilter();
  loadTodos();
}

// Add category form
document.getElementById("add-category-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("new-category-name");
  const name  = input.value.trim();
  if (!name) return;

  const res = await fetch("/api/categories", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ name }),
  });

  if (res.ok) {
    input.value = "";
    await loadCategories();   // refresh chips, filter bar, and selects
    loadTodos();              // re-render in case colors changed
  } else {
    const err = await res.json();
    showError(err.error || "Could not create category");
  }
});

async function deleteCategory(id) {
  if (!confirm("Delete this category? Todos in it will become uncategorized.")) return;

  const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
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
    catBadge = `<span class="cat-badge" style="${catStyle(todo.category_id)}">${escapeHtml(todo.category_name)}</span>`;
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
               onchange="toggleTodo(${todo.id})">
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
  if (res.ok) loadTodos();
  else showError("Could not update to-do");
}

// ─────────────────────────────────────────────────────────────────────────────
// Sort + show-inactive toggle
// ─────────────────────────────────────────────────────────────────────────────

document.getElementById("sort-select").addEventListener("change", loadTodos);

document.getElementById("show-inactive").addEventListener("change", (e) => {
  showInactive = e.target.checked;
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
// Toggle
// ─────────────────────────────────────────────────────────────────────────────

async function toggleTodo(id) {
  const res = await fetch(`/api/todos/${id}/toggle`, { method: "PATCH" });
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
  if (res.ok) loadTodos();
  else showError("Could not delete to-do");
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

bindRecurrenceSelect("new-");
bindRecurrenceSelect("edit-");

document.addEventListener("DOMContentLoaded", async () => {
  await loadCategories();   // must finish before loadTodos so selects are ready
  loadTodos();
});
