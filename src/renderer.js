const state = {
  settings: null,
  plan: null,
  selectedIds: new Set()
};

const fields = {
  todoistToken: document.querySelector("#todoistToken"),
  todoistApiBase: document.querySelector("#todoistApiBase"),
  donetickBaseUrl: document.querySelector("#donetickBaseUrl"),
  donetickApiKey: document.querySelector("#donetickApiKey"),
  donetickUsername: document.querySelector("#donetickUsername"),
  donetickPassword: document.querySelector("#donetickPassword"),
  donetickAuthToken: document.querySelector("#donetickAuthToken"),
  donetickMode: document.querySelector("#donetickMode"),
  defaultDueTime: document.querySelector("#defaultDueTime"),
  includeComments: document.querySelector("#includeComments"),
  includeReminders: document.querySelector("#includeReminders"),
  createProjects: document.querySelector("#createProjects"),
  createLabels: document.querySelector("#createLabels"),
  subtasksAsDonetick: document.querySelector("#subtasksAsDonetick"),
  skipDuplicates: document.querySelector("#skipDuplicates"),
  syncTodoistBeforePreview: document.querySelector("#syncTodoistBeforePreview"),
  forceFullTodoistSync: document.querySelector("#forceFullTodoistSync")
};

const elements = {
  statusText: document.querySelector("#statusText"),
  previewSummary: document.querySelector("#previewSummary"),
  resultSummary: document.querySelector("#resultSummary"),
  previewRows: document.querySelector("#previewRows"),
  resultLog: document.querySelector("#resultLog"),
  importBtn: document.querySelector("#importBtn"),
  previewBtn: document.querySelector("#previewBtn"),
  testConnectionsBtn: document.querySelector("#testConnectionsBtn"),
  saveSettingsBtn: document.querySelector("#saveSettingsBtn"),
  clearSettingsBtn: document.querySelector("#clearSettingsBtn"),
  clearCacheBtn: document.querySelector("#clearCacheBtn"),
  selectAllBtn: document.querySelector("#selectAllBtn"),
  selectNoneBtn: document.querySelector("#selectNoneBtn")
};

function escapeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setBusy(isBusy, message) {
  for (const button of [elements.previewBtn, elements.testConnectionsBtn, elements.saveSettingsBtn, elements.clearSettingsBtn, elements.clearCacheBtn, elements.importBtn]) {
    button.disabled = isBusy || (button === elements.importBtn && !canImport());
  }
  elements.statusText.textContent = message || "Ready.";
}

function canImport() {
  return Boolean(state.plan && state.plan.items.length && state.selectedIds.size);
}

function getSettingsFromForm() {
  return {
    todoistApiBase: fields.todoistApiBase.value.trim(),
    todoistToken: fields.todoistToken.value.trim(),
    donetickBaseUrl: fields.donetickBaseUrl.value.trim(),
    donetickApiKey: fields.donetickApiKey.value.trim(),
    donetickUsername: fields.donetickUsername.value.trim(),
    donetickPassword: fields.donetickPassword.value,
    donetickAuthToken: fields.donetickAuthToken.value.trim(),
    importOptions: getOptionsFromForm()
  };
}

function getOptionsFromForm() {
  const simpleMode = fields.donetickMode.value === "simple";
  return {
    donetickMode: fields.donetickMode.value,
    defaultDueTime: fields.defaultDueTime.value || "09:00",
    includeComments: fields.includeComments.checked,
    includeReminders: fields.includeReminders.checked,
    createProjects: !simpleMode && fields.createProjects.checked,
    createLabels: !simpleMode && fields.createLabels.checked,
    subtasksAsDonetick: !simpleMode && fields.subtasksAsDonetick.checked,
    skipDuplicates: fields.skipDuplicates.checked,
    syncTodoistBeforePreview: fields.syncTodoistBeforePreview.checked,
    forceFullTodoistSync: fields.forceFullTodoistSync.checked
  };
}

function applySettings(settings) {
  state.settings = settings;
  fields.todoistApiBase.value = settings.todoistApiBase || "https://api.todoist.com/api/v1";
  fields.todoistToken.value = settings.todoistToken || "";
  fields.donetickBaseUrl.value = settings.donetickBaseUrl || "";
  fields.donetickApiKey.value = settings.donetickApiKey || "";
  fields.donetickUsername.value = settings.donetickUsername || "";
  fields.donetickPassword.value = "";
  fields.donetickAuthToken.value = settings.donetickAuthToken || "";

  const options = settings.importOptions || {};
  fields.donetickMode.value = options.donetickMode || "auto";
  fields.defaultDueTime.value = options.defaultDueTime || "09:00";
  fields.includeComments.checked = options.includeComments !== false;
  fields.includeReminders.checked = options.includeReminders !== false;
  fields.createProjects.checked = options.createProjects !== false;
  fields.createLabels.checked = options.createLabels !== false;
  fields.subtasksAsDonetick.checked = options.subtasksAsDonetick !== false;
  fields.skipDuplicates.checked = options.skipDuplicates !== false;
  fields.syncTodoistBeforePreview.checked = options.syncTodoistBeforePreview !== false;
  fields.forceFullTodoistSync.checked = Boolean(options.forceFullTodoistSync);
  syncModeAvailability();
}

function syncModeAvailability() {
  const simpleMode = fields.donetickMode.value === "simple";
  for (const field of [fields.createProjects, fields.createLabels, fields.subtasksAsDonetick]) {
    field.disabled = simpleMode;
  }
}

function toDatetimeLocal(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromDatetimeLocal(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid due date: ${value}`);
  }
  return date.toISOString();
}

function priorityOptions(selectedPriority) {
  const selected = Number(selectedPriority || 0);
  return [0, 1, 2, 3, 4, 5].map((priority) => {
    const label = priority === 0 ? "0 - None" : String(priority);
    return `<option value="${priority}"${priority === selected ? " selected" : ""}>${label}</option>`;
  }).join("");
}

function renderPreview(plan, snapshot) {
  state.plan = plan;
  state.selectedIds = new Set(plan.items.map((item) => item.sourceId));
  const source = snapshot.source ? `${snapshot.source}, ` : "";
  const fetched = snapshot.fetchedAt ? ` Snapshot: ${new Date(snapshot.fetchedAt).toLocaleString()}.` : "";
  elements.previewSummary.textContent = `${snapshot.tasks} Todoist tasks loaded from ${source}${plan.totals.plannedChores} Donetick chores planned.${fetched}`;

  if (!plan.items.length) {
    elements.previewRows.innerHTML = `<tr><td colspan="7" class="empty">No importable tasks found.</td></tr>`;
    elements.importBtn.disabled = true;
    return;
  }

  elements.previewRows.innerHTML = plan.items.map((item) => rowHtml(item)).join("");
  elements.previewRows.querySelectorAll("[data-select-task-id]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.selectedIds.add(checkbox.dataset.selectTaskId);
      } else {
        state.selectedIds.delete(checkbox.dataset.selectTaskId);
      }
      elements.importBtn.disabled = !canImport();
    });
  });
  elements.importBtn.disabled = !canImport();
}

function rowHtml(item) {
  const dueText = item.due ? item.due.string || item.due.date || item.due.datetime || "" : "";
  const labels = item.labels.length
    ? `<div class="chips">${item.labels.map((label) => `<span class="chip">${escapeText(label)}</span>`).join("")}</div>`
    : `<span class="muted">None</span>`;
  const warnings = item.warnings.length
    ? `<span class="note-warning">${escapeText(item.warnings.join(" "))}</span>`
    : `<span class="muted">${item.isRecurring ? "Recurring mapped" : "Ready"}</span>`;
  const sourceDetails = [
    `<strong>${escapeText(item.title)}</strong>`,
    `<small>ID: ${escapeText(item.sourceId)}</small>`,
    item.projectName ? `<small>Project: ${escapeText(item.projectName)}</small>` : `<small>Project: Inbox</small>`,
    item.sectionName ? `<small>Section: ${escapeText(item.sectionName)}</small>` : "",
    dueText ? `<small>Todoist due: ${escapeText(dueText)}</small>` : "",
    `<div>${labels}</div>`
  ].filter(Boolean).join("");
  const currentDue = toDatetimeLocal(item.payload.nextDueDate);

  return `
    <tr data-source-id="${escapeText(item.sourceId)}">
      <td><input type="checkbox" data-select-task-id="${escapeText(item.sourceId)}" checked aria-label="Import ${escapeText(item.title)}"></td>
      <td>
        <input class="edit-input" data-edit-field="name" type="text" value="${escapeText(item.payload.name)}" aria-label="Donetick name for ${escapeText(item.title)}">
      </td>
      <td><div class="source-context">${sourceDetails}</div></td>
      <td><input class="edit-input due-input" data-edit-field="nextDueDate" type="datetime-local" value="${escapeText(currentDue)}" aria-label="Donetick due date for ${escapeText(item.title)}"></td>
      <td><select class="edit-select" data-edit-field="priority" aria-label="Donetick priority for ${escapeText(item.title)}">${priorityOptions(item.payload.priority)}</select></td>
      <td><div class="edit-description" data-edit-field="description" contenteditable="true" role="textbox" aria-multiline="true" tabindex="0" aria-label="Donetick description for ${escapeText(item.title)}">${item.payload.description}</div></td>
      <td>${warnings}</td>
    </tr>
  `;
}

function renderResults(result) {
  const warnings = result.preparationWarnings || [];
  const updated = result.totals.updated || 0;
  elements.resultSummary.textContent = `${result.totals.created} created, ${updated} updated, ${result.totals.skipped} skipped, ${result.totals.failed} failed.${warnings.length ? ` ${warnings.length} setup warning${warnings.length === 1 ? "" : "s"}.` : ""}`;
  const warningEntries = warnings.map((warning) => `
    <div class="log-entry skipped">
      <strong>SETUP WARNING</strong>
      <span>${escapeText(warning)}</span>
    </div>
  `);
  const resultEntries = result.results.map((entry) => {
    const detail = entry.message || (entry.donetickId ? `Donetick ID: ${entry.donetickId}` : "");
    const warning = entry.warnings && entry.warnings.length ? `<small>${escapeText(entry.warnings.join(" "))}</small>` : "";
    return `
      <div class="log-entry ${escapeText(entry.status)}">
        <strong>${escapeText(entry.status.toUpperCase())}: ${escapeText(entry.title)}</strong>
        <span>${escapeText(detail)}</span>
        ${warning}
      </div>
    `;
  });
  elements.resultLog.innerHTML = [...warningEntries, ...resultEntries].join("");
}

async function loadSettings() {
  const settings = await window.importer.loadSettings();
  applySettings(settings);
}

async function saveSettings() {
  setBusy(true, "Saving settings...");
  try {
    const saved = await window.importer.saveSettings(getSettingsFromForm());
    applySettings(saved);
    setBusy(false, "Settings saved locally.");
  } catch (error) {
    setBusy(false, `Save failed: ${error.message}`);
  }
}

async function clearSettings() {
  setBusy(true, "Clearing saved settings...");
  try {
    const cleared = await window.importer.clearSettings();
    applySettings(cleared);
    setBusy(false, "Saved settings cleared.");
  } catch (error) {
    setBusy(false, `Clear failed: ${error.message}`);
  }
}

async function clearCache() {
  setBusy(true, "Clearing cached Todoist snapshot...");
  try {
    await window.importer.clearTodoistCache();
    state.plan = null;
    state.selectedIds = new Set();
    elements.previewSummary.textContent = "Cached Todoist snapshot cleared.";
    elements.previewRows.innerHTML = `<tr><td colspan="7" class="empty">Preview will appear here.</td></tr>`;
    elements.importBtn.disabled = true;
    setBusy(false, "Todoist snapshot cache cleared.");
  } catch (error) {
    setBusy(false, `Cache clear failed: ${error.message}`);
  }
}

async function testConnections() {
  setBusy(true, "Testing Todoist and Donetick connections...");
  try {
    const result = await window.importer.testConnections(getSettingsFromForm(), getOptionsFromForm());
    setBusy(false, `${result.todoist.message} ${result.donetick.message}`);
  } catch (error) {
    setBusy(false, `Connection test failed: ${error.message}`);
  }
}

async function preview() {
  const options = getOptionsFromForm();
  const message = options.syncTodoistBeforePreview
    ? "Syncing Todoist cache and building preview..."
    : "Loading cached Todoist snapshot and building preview...";
  setBusy(true, message);
  try {
    const result = await window.importer.previewImport(getSettingsFromForm(), options);
    renderPreview(result.plan, result.snapshot);
    setBusy(false, "Preview ready.");
  } catch (error) {
    setBusy(false, `Preview failed: ${error.message}`);
  }
}

function collectImportOverrides() {
  const overrides = [];
  const missingNames = [];
  const rows = elements.previewRows.querySelectorAll("tr[data-source-id]");

  rows.forEach((row) => {
    const sourceId = row.dataset.sourceId;
    if (!state.selectedIds.has(sourceId)) {
      return;
    }

    const name = row.querySelector('[data-edit-field="name"]').value.trim();
    if (!name) {
      missingNames.push(sourceId);
    }

    overrides.push({
      sourceId,
      name,
      nextDueDate: fromDatetimeLocal(row.querySelector('[data-edit-field="nextDueDate"]').value),
      priority: Number(row.querySelector('[data-edit-field="priority"]').value),
      description: row.querySelector('[data-edit-field="description"]').innerHTML
    });
  });

  if (missingNames.length) {
    throw new Error("Every selected task needs a Donetick name before import.");
  }

  return overrides;
}

async function runImport() {
  if (!canImport()) {
    return;
  }
  setBusy(true, "Importing selected tasks into Donetick...");
  try {
    const selected = [...state.selectedIds];
    const overrides = collectImportOverrides();
    const result = await window.importer.runImport(getSettingsFromForm(), getOptionsFromForm(), selected, overrides);
    renderResults(result);
    setBusy(false, "Import finished.");
  } catch (error) {
    setBusy(false, `Import failed: ${error.message}`);
  }
}

function selectAll(select) {
  if (!state.plan) {
    return;
  }
  state.selectedIds = select ? new Set(state.plan.items.map((item) => item.sourceId)) : new Set();
  elements.previewRows.querySelectorAll("[data-select-task-id]").forEach((checkbox) => {
    checkbox.checked = select;
  });
  elements.importBtn.disabled = !canImport();
}

elements.saveSettingsBtn.addEventListener("click", saveSettings);
elements.clearSettingsBtn.addEventListener("click", clearSettings);
elements.clearCacheBtn.addEventListener("click", clearCache);
elements.testConnectionsBtn.addEventListener("click", testConnections);
elements.previewBtn.addEventListener("click", preview);
elements.importBtn.addEventListener("click", runImport);
elements.selectAllBtn.addEventListener("click", () => selectAll(true));
elements.selectNoneBtn.addEventListener("click", () => selectAll(false));
fields.donetickMode.addEventListener("change", syncModeAvailability);

document.querySelectorAll("[data-open-url]").forEach((button) => {
  button.addEventListener("click", () => window.importer.openExternal(button.dataset.openUrl));
});

loadSettings().catch((error) => {
  elements.statusText.textContent = `Failed to load settings: ${error.message}`;
});
