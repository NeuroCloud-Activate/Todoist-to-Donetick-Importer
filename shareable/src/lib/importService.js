const { DonetickClient } = require("./donetick");
const { TodoistClient } = require("./todoist");
const {
  buildImportPlan,
  createExistingTodoistIdSet,
  escapeHtml,
  extractTodoistIdFromChore,
  taskLabelNames
} = require("./mapper");

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function summarizeSnapshot(snapshot, source = "todoist") {
  return {
    source,
    tasks: snapshot.tasks.length,
    projects: snapshot.projects.length,
    sections: snapshot.sections.length,
    labels: snapshot.labels.length,
    reminders: snapshot.reminders.length,
    commentedTasks: Object.keys(snapshot.commentsByTask || {}).length,
    fetchedAt: snapshot.fetchedAt,
    syncToken: snapshot.syncToken || null,
    fullSync: Boolean(snapshot.fullSync)
  };
}

function createClients(settings) {
  return {
    todoist: new TodoistClient({
      token: settings.todoistToken,
      apiBase: settings.todoistApiBase
    }),
    donetick: new DonetickClient({
      baseUrl: settings.donetickBaseUrl,
      apiKey: settings.donetickApiKey,
      username: settings.donetickUsername,
      password: settings.donetickPassword,
      authToken: settings.donetickAuthToken
    })
  };
}

async function testConnections(settings, options = {}) {
  const { todoist, donetick } = createClients(settings);
  const mode = options.donetickMode || settings.importOptions?.donetickMode || "auto";

  const [todoistResult, donetickResult] = await Promise.all([
    todoist.testConnection(),
    testDonetickConnectionWithFallback(donetick, mode)
  ]);
  return { todoist: todoistResult, donetick: donetickResult };
}

async function previewImport(settings, options = {}, snapshotStore = null) {
  const { snapshot, source } = await getTodoistSnapshot(settings, options, snapshotStore, {
    allowCacheOnly: true,
    preferCache: options.syncTodoistBeforePreview === false
  });
  const plan = buildImportPlan(snapshot, options);
  return {
    snapshot: summarizeSnapshot(snapshot, source),
    plan
  };
}

async function runImport(settings, options = {}, selectedTaskIds = [], snapshotStore = null, itemOverrides = []) {
  const { donetick } = createClients(settings);
  let mode = normalizeRequestedMode(options.donetickMode || "auto");
  let existingChores = null;
  const { snapshot, source } = await getTodoistSnapshot(settings, options, snapshotStore, {
    allowCacheOnly: true,
    preferCache: true
  });
  const preparationWarnings = [];

  if (mode === "auto") {
    try {
      existingChores = await donetick.getChores("full");
      mode = "full";
    } catch (error) {
      preparationWarnings.push(`Donetick full API could not be reached (${formatErrorStatus(error)}). Falling back to the Simple external API, which cannot create native labels, projects, subtasks, or recurrence.`);
      mode = "simple";
    }
  }

  let projectIdByTodoistId = new Map();
  let labelIdByName = new Map();

  if (mode === "full" && options.createProjects) {
    const referencedProjectIds = new Set(snapshot.tasks.map((task) => task.project_id).filter(Boolean));
    const projects = snapshot.projects.filter((project) => referencedProjectIds.has(project.id));
    try {
      projectIdByTodoistId = await donetick.ensureProjects(projects);
    } catch (error) {
      if (isAuthOrUnavailableError(error)) {
        preparationWarnings.push(buildSetupWarning("projects", error));
      } else {
        throw error;
      }
    }
  }

  if (mode === "full" && options.createLabels) {
    try {
      labelIdByName = await donetick.ensureLabels(snapshot.labels, taskLabelNames(snapshot.tasks));
    } catch (error) {
      if (isAuthOrUnavailableError(error)) {
        preparationWarnings.push(buildSetupWarning("labels", error));
      } else {
        throw error;
      }
    }
  }

  const selected = selectedTaskIds && selectedTaskIds.length ? selectedTaskIds : null;
  const plan = buildImportPlan(snapshot, options, { projectIdByTodoistId, labelIdByName }, selected);
  const items = applyItemOverrides(plan.items, itemOverrides);
  existingChores = options.skipDuplicates !== false
    ? existingChores || await donetick.getChores(mode)
    : existingChores || [];
  const existingTodoistIds = createExistingTodoistIdSet(existingChores);
  const existingChoreByTodoistId = createExistingTodoistChoreMap(existingChores);

  const results = [];
  for (const item of items) {
    if (options.skipDuplicates !== false && existingTodoistIds.has(item.sourceId)) {
      const existingChore = existingChoreByTodoistId.get(item.sourceId);
      if (mode === "full" && shouldRepairExistingImport(existingChore, item)) {
        try {
          await donetick.updateChoreFromImportItem(existingChore, item);
          results.push({
            sourceId: item.sourceId,
            title: item.title,
            status: "updated",
            message: "Already imported; missing native fields updated",
            warnings: item.warnings
          });
          continue;
        } catch (error) {
          results.push({
            sourceId: item.sourceId,
            title: item.title,
            status: "failed",
            message: `Already imported, but label update failed: ${error.message}`
          });
          continue;
        }
      }
      results.push({
        sourceId: item.sourceId,
        title: item.title,
        status: "skipped",
        message: "Already imported"
      });
      continue;
    }

    try {
      const created = await donetick.createChore(item, mode);
      existingTodoistIds.add(item.sourceId);
      results.push({
        sourceId: item.sourceId,
        title: item.title,
        status: "created",
        donetickId: created && (created.id || created),
        warnings: item.warnings
      });
    } catch (error) {
      results.push({
        sourceId: item.sourceId,
        title: item.title,
        status: "failed",
        message: error.message
      });
    }
  }

  return {
    snapshot: summarizeSnapshot(snapshot, source),
    mode,
    preparationWarnings,
    totals: {
      planned: items.length,
      created: results.filter((result) => result.status === "created").length,
      updated: results.filter((result) => result.status === "updated").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      failed: results.filter((result) => result.status === "failed").length
    },
    results
  };
}

async function testDonetickConnectionWithFallback(donetick, requestedMode = "auto") {
  const mode = normalizeRequestedMode(requestedMode);
  if (mode !== "auto") {
    return donetick.testConnection(mode);
  }

  try {
    const result = await donetick.testConnection("full");
    return {
      ...result,
      message: `${result.message} Full API will be used.`
    };
  } catch (error) {
    const simpleResult = await donetick.testConnection("simple");
    return {
      ...simpleResult,
      message: `Full API failed (${formatErrorStatus(error)}). ${simpleResult.message} Simple external API will be used only as fallback.`
    };
  }
}

function normalizeRequestedMode(mode) {
  return ["auto", "full", "simple"].includes(mode) ? mode : "auto";
}

function formatErrorStatus(error) {
  return error && error.status ? `HTTP ${error.status}` : (error && error.message) || "unknown error";
}

function createExistingTodoistChoreMap(chores = []) {
  const byTodoistId = new Map();
  for (const chore of chores) {
    const todoistId = extractTodoistIdFromChore(chore);
    if (todoistId) {
      byTodoistId.set(todoistId, chore);
    }
  }
  return byTodoistId;
}

function hasNativeLabels(item) {
  return Boolean(item && item.payload && Array.isArray(item.payload.labelsV2) && item.payload.labelsV2.length);
}

function shouldRepairExistingImport(existingChore, item) {
  if (!existingChore || !item || !item.payload) {
    return false;
  }
  return hasMissingNativeLabels(existingChore, item) || hasMissingDueDate(existingChore, item);
}

function hasMissingNativeLabels(existingChore, item) {
  if (!hasNativeLabels(item)) {
    return false;
  }
  const existingIds = new Set((existingChore.labelsV2 || []).map((label) => Number(label.id)).filter(Boolean));
  return item.payload.labelsV2.some((label) => !existingIds.has(Number(label.id)));
}

function hasMissingDueDate(existingChore, item) {
  return Boolean(!existingChore.nextDueDate && item.payload.nextDueDate);
}

function applyItemOverrides(items = [], itemOverrides = []) {
  if (!Array.isArray(itemOverrides) || itemOverrides.length === 0) {
    return items;
  }

  const overrideBySourceId = new Map(
    itemOverrides
      .filter((override) => override && override.sourceId)
      .map((override) => [String(override.sourceId), override])
  );

  return items.map((item) => applyItemOverride(item, overrideBySourceId.get(String(item.sourceId))));
}

function applyItemOverride(item, override) {
  if (!override) {
    return item;
  }

  const next = {
    ...item,
    labels: [...(item.labels || [])],
    warnings: [...(item.warnings || [])],
    payload: { ...(item.payload || {}) },
    simplePayload: { ...(item.simplePayload || {}) }
  };

  if (Object.prototype.hasOwnProperty.call(override, "name")) {
    const name = String(override.name || "").trim();
    if (!name) {
      throw new Error(`Edited Donetick name is required for Todoist task ${item.sourceId}.`);
    }
    next.title = name;
    next.payload.name = name;
    next.simplePayload.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(override, "nextDueDate")) {
    const nextDueDate = normalizeOverrideDate(override.nextDueDate, item.sourceId);
    if (nextDueDate) {
      next.payload.nextDueDate = nextDueDate;
      next.simplePayload.dueDate = nextDueDate.slice(0, 10);
    } else {
      delete next.payload.nextDueDate;
      next.simplePayload.dueDate = "";
    }
  }

  if (Object.prototype.hasOwnProperty.call(override, "priority")) {
    next.payload.priority = normalizeOverridePriority(override.priority, item.sourceId);
  }

  if (Object.prototype.hasOwnProperty.call(override, "description")) {
    const description = ensureTodoistMarker(override.description, item.sourceId);
    next.payload.description = description;
    next.simplePayload.description = description;
  }

  return next;
}

function normalizeOverrideDate(value, sourceId) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Edited due date is invalid for Todoist task ${sourceId}.`);
  }
  return date.toISOString();
}

function normalizeOverridePriority(value, sourceId) {
  const priority = Number(value);
  if (!Number.isFinite(priority)) {
    throw new Error(`Edited priority is invalid for Todoist task ${sourceId}.`);
  }
  return Math.max(0, Math.min(5, Math.round(priority)));
}

function ensureTodoistMarker(description, sourceId) {
  const html = String(description || "").trim();
  const expectedId = escapeRegExp(String(sourceId));
  const markerPattern = new RegExp(`Todoist task ID:\\s*</strong>\\s*${expectedId}(?=<|\\s|$)`, "i");

  if (markerPattern.test(html)) {
    return html;
  }

  const marker = `<hr><h3>Imported from Todoist</h3><ul><li><strong>Todoist task ID:</strong> ${escapeHtml(sourceId)}</li></ul>`;
  return html ? `${html}\n${marker}` : marker;
}

function isAuthOrUnavailableError(error) {
  return error && [401, 403, 404, 405].includes(Number(error.status));
}

function buildSetupWarning(resourceName, error) {
  const status = error && error.status ? `HTTP ${error.status}` : "the server response";
  if (error && [401, 403].includes(Number(error.status))) {
    return `Donetick ${resourceName} could not be created or matched with this API key on this server (${status}). Chores will still import, and Todoist ${resourceName} are preserved in the description.`;
  }
  return `Donetick ${resourceName} could not be created or matched (${status}). Chores will still import, and Todoist ${resourceName} are preserved in the description.`;
}

async function clearTodoistCache(snapshotStore) {
  if (!snapshotStore) {
    return null;
  }
  return snapshotStore.clear();
}

async function getTodoistSnapshot(settings, options = {}, snapshotStore = null, behavior = {}) {
  const cached = snapshotStore ? await snapshotStore.load() : null;
  if (behavior.preferCache && cached) {
    return { snapshot: cached, source: "cache" };
  }

  if (behavior.preferCache && behavior.allowCacheOnly && !cached) {
    throw new Error("No cached Todoist snapshot is available. Enable Todoist sync before preview.");
  }

  const { todoist } = createClients(settings);
  const snapshot = await todoist.fetchSnapshot(options, cached);
  if (snapshotStore) {
    await snapshotStore.save(snapshot);
  }
  return {
    snapshot,
    source: cached && cached.syncToken && !options.forceFullTodoistSync ? "incremental-sync" : "full-sync"
  };
}

module.exports = {
  applyItemOverride,
  applyItemOverrides,
  clearTodoistCache,
  createExistingTodoistChoreMap,
  ensureTodoistMarker,
  getTodoistSnapshot,
  hasMissingDueDate,
  hasMissingNativeLabels,
  normalizeRequestedMode,
  previewImport,
  runImport,
  testDonetickConnectionWithFallback,
  testConnections
};
