const { normalizeArrayResponse, normalizeBaseUrl, parseJsonResponse } = require("./http");

const TODOIST_COLOR_HEX = {
  berry_red: "#b8255f",
  red: "#dc4c3e",
  orange: "#c77100",
  yellow: "#b29104",
  olive_green: "#949c31",
  lime_green: "#65a33a",
  green: "#369307",
  mint_green: "#42a393",
  teal: "#148fad",
  sky_blue: "#319dc0",
  light_blue: "#6988a4",
  blue: "#4180ff",
  grape: "#692ec2",
  violet: "#ca3fee",
  lavender: "#a4698c",
  magenta: "#e05095",
  salmon: "#c9766f",
  charcoal: "#808080",
  grey: "#999999",
  taupe: "#8f7a69"
};

function unwrapResult(payload) {
  if (payload && Object.prototype.hasOwnProperty.call(payload, "res")) {
    return payload.res;
  }
  return payload;
}

class DonetickClient {
  constructor({ baseUrl, apiKey, username, password, authToken, fetchImpl = globalThis.fetch } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl, "http");
    this.apiKey = String(apiKey || "").trim();
    this.username = String(username || "").trim();
    this.password = String(password || "");
    this.authToken = String(authToken || "").trim();
    this.fetch = fetchImpl;
  }

  assertReady() {
    if (!this.baseUrl) {
      throw new Error("Donetick server URL is required.");
    }
    if (!this.hasJwtAuth() && !this.apiKey) {
      throw new Error("Donetick username/password or API key is required.");
    }
    if (!this.fetch) {
      throw new Error("Fetch is not available in this runtime.");
    }
  }

  async request(path, { method = "GET", body, authMode = "auto" } = {}) {
    this.assertReady();
    if ((authMode === "auto" || authMode === "label") && this.hasJwtAuth() && this.apiKey) {
      try {
        return await this.requestWithAuth(path, { method, body, authMode: "jwt" });
      } catch (error) {
        if (!isAuthError(error)) {
          throw error;
        }
        return this.requestWithAuth(path, { method, body, authMode: "apiKey" });
      }
    }

    return this.requestWithAuth(path, { method, body, authMode });
  }

  async requestWithAuth(path, { method = "GET", body, authMode = "auto" } = {}) {
    const headers = await this.buildHeaders(authMode, body !== undefined);
    const response = await this.fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return parseJsonResponse(response);
  }

  async buildHeaders(authMode = "auto", hasBody = false) {
    const headers = {
      Accept: "application/json"
    };

    const useJwt = authMode === "jwt" || ((authMode === "auto" || authMode === "label") && this.hasJwtAuth());
    if (useJwt) {
      headers.Authorization = `Bearer ${await this.getJwtToken()}`;
    } else {
      if (!this.apiKey) {
        throw new Error("Donetick API key is required for this request.");
      }
      headers.secretkey = this.apiKey;
    }

    if (hasBody) {
      headers["Content-Type"] = "application/json";
    }
    return headers;
  }

  hasJwtAuth() {
    return Boolean(this.authToken || (this.username && this.password));
  }

  async getJwtToken() {
    if (this.authToken) {
      return this.authToken;
    }
    if (!this.username || !this.password) {
      throw new Error("Donetick username and password are required for native label creation on this server.");
    }

    const response = await this.fetch(`${this.baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: this.username,
        password: this.password
      })
    });
    const payload = await parseJsonResponse(response);
    if (payload && payload.mfaRequired) {
      throw new Error("Donetick login requires MFA. Paste a Donetick JWT token instead of username/password for native label creation.");
    }
    const token = payload && (payload.access_token || payload.token);
    if (!token) {
      throw new Error("Donetick login did not return an access token.");
    }
    this.authToken = token;
    return this.authToken;
  }

  async testConnection(mode = "full") {
    if (mode === "simple") {
      const chores = await this.getChores("simple");
      return {
        ok: true,
        message: `Donetick simple API connection succeeded. Found ${chores.length} chores.`
      };
    }

    const chores = await this.getChores("full");
    return {
      ok: true,
      message: `Donetick full API connection succeeded. Found ${chores.length} chores.`
    };
  }

  async getChores(mode = "full") {
    const path = mode === "simple" ? "/eapi/v1/chore" : "/api/v1/chores/";
    const payload = await this.request(path, { authMode: mode === "simple" ? "apiKey" : "auto" });
    return normalizeArrayResponse(unwrapResult(payload));
  }

  async getProjects() {
    const payload = await this.request("/api/v1/projects");
    return normalizeArrayResponse(unwrapResult(payload));
  }

  async createProject(project) {
    const payload = await this.request("/api/v1/projects", {
      method: "POST",
      body: project
    });
    return unwrapResult(payload);
  }

  async getLabels() {
    const payload = await this.request("/api/v1/labels", { authMode: "label" });
    return normalizeArrayResponse(unwrapResult(payload));
  }

  async createLabel(label) {
    const payload = await this.request("/api/v1/labels", {
      method: "POST",
      body: label,
      authMode: "label"
    });
    return unwrapResult(payload);
  }

  async updateChoreLabels(chore, labelRefs = []) {
    const payload = buildChoreLabelUpdatePayload(chore, labelRefs);
    const responsePayload = await this.request("/api/v1/chores/", {
      method: "PUT",
      body: payload
    });
    return unwrapResult(responsePayload);
  }

  async updateChoreFromImportItem(chore, item) {
    const payload = item && item.payload ? item.payload : {};
    const missingLabels = hasMissingLabelRefs(chore.labelsV2, payload.labelsV2);
    let result = null;

    if (missingLabels) {
      const updatePayload = buildChoreImportUpdatePayload(chore, item);
      const responsePayload = await this.request("/api/v1/chores/", {
        method: "PUT",
        body: updatePayload
      });
      result = unwrapResult(responsePayload);
    }

    if (payload.nextDueDate && chore.nextDueDate !== payload.nextDueDate) {
      result = await this.updateChoreDueDate(chore.id, payload.nextDueDate);
    }

    return result;
  }

  async updateChoreDueDate(choreId, dueDate, updatedAt = new Date().toISOString()) {
    const payload = await this.request(`/api/v1/chores/${choreId}/dueDate`, {
      method: "PUT",
      body: {
        dueDate: dueDate || null,
        updatedAt
      }
    });
    return unwrapResult(payload);
  }

  async createChore(item, mode = "full") {
    if (mode === "simple") {
      const payload = await this.request("/eapi/v1/chore", {
        method: "POST",
        body: item.simplePayload,
        authMode: "apiKey"
      });
      return unwrapResult(payload);
    }

    const payload = await this.request("/api/v1/chores/", {
      method: "POST",
      body: item.payload
    });
    const created = unwrapResult(payload);
    const createdId = created && (created.id || created);
    if (createdId && item.payload && item.payload.nextDueDate) {
      await this.updateChoreDueDate(createdId, item.payload.nextDueDate);
    }
    return created;
  }

  async ensureProjects(todoistProjects = []) {
    const existing = await this.getProjects();
    const byName = new Map(existing.map((project) => [String(project.name || "").toLowerCase(), project]));
    const byTodoistId = new Map();

    for (const todoistProject of todoistProjects) {
      const name = String(todoistProject.name || "").trim();
      if (!name) {
        continue;
      }
      const key = name.toLowerCase();
      let donetickProject = byName.get(key);
      if (!donetickProject) {
        donetickProject = await this.createProject({
          name,
          description: `Imported from Todoist project ${todoistProject.id}.`,
          color: TODOIST_COLOR_HEX[todoistProject.color] || undefined
        });
        byName.set(key, donetickProject);
      }
      if (donetickProject && donetickProject.id) {
        byTodoistId.set(todoistProject.id, donetickProject.id);
      }
    }

    return byTodoistId;
  }

  async ensureLabels(todoistLabels = [], taskLabelNames = []) {
    const existing = await this.getLabels();
    const byName = new Map(existing.map((label) => [String(label.name || "").toLowerCase(), label]));
    const sourceLabels = new Map();

    for (const label of todoistLabels) {
      if (label && label.name) {
        sourceLabels.set(label.name, label);
      }
    }
    for (const labelName of taskLabelNames) {
      if (labelName && !sourceLabels.has(labelName)) {
        sourceLabels.set(labelName, { name: labelName });
      }
    }

    const byLabelName = new Map();
    for (const [labelName, todoistLabel] of sourceLabels.entries()) {
      const key = String(labelName).toLowerCase();
      let donetickLabel = byName.get(key);
      if (!donetickLabel) {
        donetickLabel = await this.createLabel({
          name: labelName,
          color: TODOIST_COLOR_HEX[todoistLabel.color] || "#4180ff"
        });
        byName.set(key, donetickLabel);
      }
      if (donetickLabel && donetickLabel.id) {
        byLabelName.set(labelName, donetickLabel.id);
      }
    }

    return byLabelName;
  }
}

function buildChoreLabelUpdatePayload(chore, labelRefs = []) {
  return buildChoreUpdatePayload(chore, { labelRefs });
}

function buildChoreImportUpdatePayload(chore, item) {
  const payload = item && item.payload ? item.payload : {};
  return buildChoreUpdatePayload(chore, {
    labelRefs: payload.labelsV2 || [],
    nextDueDate: chore.nextDueDate || payload.nextDueDate,
    frequencyType: payload.frequencyType,
    frequency: payload.frequency,
    frequencyMetadata: payload.frequencyMetadata,
    projectId: chore.projectId || payload.projectId
  });
}

function buildChoreUpdatePayload(chore, patch = {}) {
  const existingIds = normalizeLabelRefs(chore.labelsV2);
  const requestedIds = normalizeLabelRefs(patch.labelRefs);
  const labelsV2 = [...new Set([...existingIds, ...requestedIds])].map((id) => ({ id }));
  const frequency = Number(patch.frequency || chore.frequency || 1);
  const priority = Number(chore.priority || 0);
  const isActive = chore.isActive !== false;
  const isPrivate = Boolean(chore.isPrivate);
  const description = chore.description == null ? "" : String(chore.description);

  return removeUndefined({
    id: chore.id,
    name: chore.name || "(Untitled chore)",
    frequencyType: patch.frequencyType || chore.frequencyType || "once",
    frequency: frequency > 0 ? frequency : 1,
    frequencyMetadata: patch.frequencyMetadata || chore.frequencyMetadata || undefined,
    nextDueDate: patch.nextDueDate || chore.nextDueDate || undefined,
    isRolling: Boolean(chore.isRolling),
    assignedTo: chore.assignedTo || undefined,
    assignees: Array.isArray(chore.assignees) ? chore.assignees : [],
    assignStrategy: chore.assignStrategy || "no_assignee",
    isActive,
    notification: Boolean(chore.notification),
    notificationMetadata: chore.notificationMetadata || undefined,
    labelsV2,
    priority: Math.max(0, Math.min(5, Number.isFinite(priority) ? priority : 0)),
    completionWindow: chore.completionWindow == null ? undefined : chore.completionWindow,
    points: chore.points == null ? undefined : chore.points,
    description,
    subTasks: Array.isArray(chore.subTasks) ? chore.subTasks : [],
    requireApproval: Boolean(chore.requireApproval),
    isPrivate,
    projectId: patch.projectId || chore.projectId || undefined
  });
}

function normalizeLabelRefs(labels) {
  if (!Array.isArray(labels)) {
    return [];
  }
  return labels
    .map((label) => Number(label && (label.id || label.labelId)))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function hasMissingLabelRefs(existingLabels, requestedLabels) {
  const existingIds = new Set(normalizeLabelRefs(existingLabels));
  return normalizeLabelRefs(requestedLabels).some((id) => !existingIds.has(id));
}

function removeUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter((entry) => entry[1] !== undefined));
}

function isAuthError(error) {
  return error && [401, 403].includes(Number(error.status));
}

module.exports = {
  buildChoreImportUpdatePayload,
  buildChoreLabelUpdatePayload,
  DonetickClient,
  hasMissingLabelRefs,
  TODOIST_COLOR_HEX
};
