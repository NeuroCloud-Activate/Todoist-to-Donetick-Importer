const { appendQuery, normalizeArrayResponse, normalizeBaseUrl, parseJsonResponse } = require("./http");

const FULL_SYNC_RESOURCE_TYPES = [
  "projects",
  "items",
  "sections",
  "labels",
  "notes",
  "project_notes",
  "reminders",
  "reminders_location",
  "collaborators",
  "collaborator_states",
  "user",
  "user_settings"
];

const INCREMENTAL_SYNC_RESOURCE_TYPES = [
  ...FULL_SYNC_RESOURCE_TYPES,
  "workspace_users"
];

class TodoistClient {
  constructor({ token, apiBase = "https://api.todoist.com/api/v1", fetchImpl = globalThis.fetch } = {}) {
    this.token = String(token || "").trim();
    this.apiBase = normalizeBaseUrl(apiBase || "https://api.todoist.com/api/v1", "https");
    this.fetch = fetchImpl;
  }

  assertReady() {
    if (!this.token) {
      throw new Error("Todoist API token is required.");
    }
    if (!this.apiBase) {
      throw new Error("Todoist API base URL is required.");
    }
    if (!this.fetch) {
      throw new Error("Fetch is not available in this runtime.");
    }
  }

  async request(path, params = {}) {
    this.assertReady();
    const url = appendQuery(new URL(`${this.apiBase}${path}`), params);
    const response = await this.fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json"
      }
    });
    return parseJsonResponse(response);
  }

  async sync({ syncToken = "*", resourceTypes = FULL_SYNC_RESOURCE_TYPES } = {}) {
    this.assertReady();
    const body = new URLSearchParams({
      sync_token: syncToken,
      resource_types: JSON.stringify(resourceTypes)
    });

    const response = await this.fetch(`${this.apiBase}/sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });
    return parseJsonResponse(response);
  }

  async getPaginated(path, params = {}) {
    const all = [];
    let cursor = params.cursor || null;
    let pages = 0;

    do {
      const page = await this.request(path, {
        ...params,
        cursor,
        limit: params.limit || 200
      });

      all.push(...normalizeArrayResponse(page));
      cursor = page && page.next_cursor ? page.next_cursor : null;
      pages += 1;
    } while (cursor && pages < 200);

    return all;
  }

  async testConnection() {
    const payload = await this.sync({
      syncToken: "*",
      resourceTypes: ["projects"]
    });
    return {
      ok: true,
      message: `Todoist connection succeeded. Sync token received with ${Array.isArray(payload.projects) ? payload.projects.length : 0} project sample.`
    };
  }

  async fetchSnapshot(options = {}, cachedSnapshot = null) {
    const forceFullSync = Boolean(options.forceFullTodoistSync);
    const syncToken = forceFullSync || !cachedSnapshot || !cachedSnapshot.syncToken
      ? "*"
      : cachedSnapshot.syncToken;
    const resourceTypes = syncToken === "*" ? FULL_SYNC_RESOURCE_TYPES : INCREMENTAL_SYNC_RESOURCE_TYPES;
    const payload = await this.sync({ syncToken, resourceTypes });
    return mergeSyncSnapshot(cachedSnapshot, payload);
  }
}

function mergeSyncSnapshot(cachedSnapshot, syncPayload) {
  const base = syncPayload.full_sync || !cachedSnapshot
    ? emptySnapshot()
    : normalizeSnapshot(cachedSnapshot);

  const merged = {
    ...base,
    syncToken: syncPayload.sync_token || base.syncToken || null,
    fullSync: Boolean(syncPayload.full_sync),
    fullSyncDateUtc: syncPayload.full_sync_date_utc || base.fullSyncDateUtc || null,
    fetchedAt: new Date().toISOString()
  };

  merged.projects = mergeResourceArray(base.projects, syncPayload.projects);
  merged.sections = mergeResourceArray(base.sections, syncPayload.sections);
  merged.labels = mergeResourceArray(base.labels, syncPayload.labels);
  merged.tasks = mergeResourceArray(base.tasks, syncPayload.items, { activeTaskOnly: true });
  merged.notes = mergeResourceArray(base.notes, syncPayload.notes);
  merged.projectNotes = mergeResourceArray(base.projectNotes, syncPayload.project_notes);
  merged.reminders = mergeResourceArray(
    base.reminders,
    [...asArray(syncPayload.reminders), ...asArray(syncPayload.reminders_location)]
  );
  merged.collaborators = mergeObjectMap(base.collaborators, syncPayload.collaborators);
  merged.collaboratorStates = mergeResourceArray(base.collaboratorStates, syncPayload.collaborator_states);
  merged.workspaceUsers = mergeObjectMap(base.workspaceUsers, syncPayload.workspace_users);
  merged.user = syncPayload.user || base.user || null;
  merged.userSettings = syncPayload.user_settings || base.userSettings || null;
  merged.commentsByTask = groupNotesByTask(merged.notes);

  return normalizeSnapshot(merged);
}

function normalizeSnapshot(snapshot = {}) {
  const notes = asArray(snapshot.notes);
  const reminders = asArray(snapshot.reminders);
  return {
    syncToken: snapshot.syncToken || snapshot.sync_token || null,
    fullSync: Boolean(snapshot.fullSync || snapshot.full_sync),
    fullSyncDateUtc: snapshot.fullSyncDateUtc || snapshot.full_sync_date_utc || null,
    fetchedAt: snapshot.fetchedAt || new Date().toISOString(),
    tasks: asArray(snapshot.tasks || snapshot.items).filter(isActiveTask),
    projects: asArray(snapshot.projects).filter(isActiveResource),
    sections: asArray(snapshot.sections).filter(isActiveResource),
    labels: asArray(snapshot.labels).filter(isActiveResource),
    notes: notes.filter(isActiveResource),
    projectNotes: asArray(snapshot.projectNotes || snapshot.project_notes).filter(isActiveResource),
    reminders: reminders.filter(isActiveResource),
    collaborators: snapshot.collaborators || {},
    collaboratorStates: asArray(snapshot.collaboratorStates || snapshot.collaborator_states).filter(isActiveResource),
    workspaceUsers: snapshot.workspaceUsers || snapshot.workspace_users || {},
    user: snapshot.user || null,
    userSettings: snapshot.userSettings || snapshot.user_settings || null,
    commentsByTask: snapshot.commentsByTask || groupNotesByTask(notes)
  };
}

function emptySnapshot() {
  return {
    syncToken: null,
    fullSync: false,
    fullSyncDateUtc: null,
    fetchedAt: null,
    tasks: [],
    projects: [],
    sections: [],
    labels: [],
    notes: [],
    projectNotes: [],
    reminders: [],
    collaborators: {},
    collaboratorStates: [],
    workspaceUsers: {},
    user: null,
    userSettings: null,
    commentsByTask: {}
  };
}

function mergeResourceArray(existing = [], updates = [], options = {}) {
  const byId = new Map();
  for (const item of asArray(existing)) {
    if (item && item.id && isActiveResource(item) && (!options.activeTaskOnly || isActiveTask(item))) {
      byId.set(item.id, item);
    }
  }

  for (const update of asArray(updates)) {
    if (!update || !update.id) {
      continue;
    }
    if (!isActiveResource(update) || (options.activeTaskOnly && !isActiveTask(update))) {
      byId.delete(update.id);
      continue;
    }
    byId.set(update.id, {
      ...(byId.get(update.id) || {}),
      ...update
    });
  }

  return [...byId.values()].sort(compareTodoistOrder);
}

function mergeObjectMap(existing = {}, updates) {
  if (!updates || typeof updates !== "object") {
    return existing || {};
  }

  const merged = { ...(existing || {}) };
  for (const [key, value] of Object.entries(updates)) {
    if (value && value.is_deleted) {
      delete merged[key];
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function groupNotesByTask(notes) {
  const grouped = {};
  for (const note of asArray(notes)) {
    const taskId = note.item_id || note.task_id;
    if (!taskId || !isActiveResource(note)) {
      continue;
    }
    if (!grouped[taskId]) {
      grouped[taskId] = [];
    }
    grouped[taskId].push(note);
  }
  return grouped;
}

function compareTodoistOrder(left, right) {
  const projectOrder = Number(left.child_order || left.item_order || left.order || 0) - Number(right.child_order || right.item_order || right.order || 0);
  if (projectOrder !== 0) {
    return projectOrder;
  }
  return String(left.id).localeCompare(String(right.id));
}

function isActiveResource(item) {
  return !item.is_deleted && !item.is_archived;
}

function isActiveTask(task) {
  return isActiveResource(task) && !task.checked;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = {
  FULL_SYNC_RESOURCE_TYPES,
  INCREMENTAL_SYNC_RESOURCE_TYPES,
  TodoistClient,
  mergeSyncSnapshot,
  normalizeSnapshot
};
