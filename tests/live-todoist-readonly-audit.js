const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { previewImport } = require("../src/lib/importService");
const { createSnapshotStore } = require("../src/lib/snapshotStore");

if (process.env.RUN_LIVE_TODOIST_AUDIT !== "1") {
  console.log("Skipping live Todoist audit. Set RUN_LIVE_TODOIST_AUDIT=1 to run.");
  process.exit(0);
}

const token = process.env.TODOIST_API_TOKEN;
assert.ok(token, "TODOIST_API_TOKEN is required.");

const originalFetch = globalThis.fetch;
const calls = [];

globalThis.fetch = async (url, options = {}) => {
  const parsed = new URL(String(url));
  const method = options.method || "GET";
  calls.push({
    method,
    path: parsed.pathname,
    resourceTypes: options.body instanceof URLSearchParams
      ? JSON.parse(options.body.get("resource_types") || "[]")
      : []
  });

  if (parsed.hostname !== "api.todoist.com") {
    throw new Error(`Unexpected host: ${parsed.hostname}`);
  }
  if (method !== "POST" || parsed.pathname !== "/api/v1/sync") {
    throw new Error(`Unexpected Todoist API call: ${method} ${parsed.pathname}`);
  }

  return originalFetch(url, options);
};

function countTasks(tasks, predicate) {
  return tasks.filter(predicate).length;
}

function summarizeCoverage(snapshot, plan) {
  const tasks = snapshot.tasks || [];
  const taskIdsWithComments = new Set(Object.keys(snapshot.commentsByTask || {}));
  const parentIds = new Set(tasks.map((task) => task.parent_id).filter(Boolean));
  const directChildIds = new Set(tasks.filter((task) => task.parent_id).map((task) => task.id));
  const plannedIds = new Set(plan.items.map((item) => item.sourceId));

  return {
    activeTasks: tasks.length,
    projects: snapshot.projects.length,
    sections: snapshot.sections.length,
    labels: snapshot.labels.length,
    notes: snapshot.notes.length,
    reminders: snapshot.reminders.length,
    commentedTasks: taskIdsWithComments.size,
    plannedChores: plan.items.length,
    parentTasksWithChildren: parentIds.size,
    childTasksFoldedIntoParents: [...directChildIds].filter((id) => !plannedIds.has(id)).length,
    tasksWithDueDates: countTasks(tasks, (task) => Boolean(task.due && (task.due.date || task.due.datetime))),
    recurringTasks: countTasks(tasks, (task) => Boolean(task.due && task.due.is_recurring)),
    tasksWithDeadlines: countTasks(tasks, (task) => Boolean(task.deadline)),
    tasksWithDurations: countTasks(tasks, (task) => Boolean(task.duration)),
    tasksWithLabels: countTasks(tasks, (task) => Array.isArray(task.labels) && task.labels.length > 0),
    tasksWithAssignees: countTasks(tasks, (task) => Boolean(task.responsible_uid || task.assigned_by_uid)),
    warningItems: plan.items.filter((item) => item.warnings.length > 0).length
  };
}

async function main() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "todoist-readonly-audit-"));
  const snapshotStore = createSnapshotStore(tmpDir);
  const settings = {
    todoistApiBase: "https://api.todoist.com/api/v1",
    todoistToken: token,
    donetickBaseUrl: "",
    donetickApiKey: "",
    importOptions: {}
  };
  const options = {
    includeComments: true,
    includeReminders: true,
    createProjects: true,
    createLabels: true,
    subtasksAsDonetick: true,
    skipDuplicates: true,
    defaultDueTime: "09:00",
    syncTodoistBeforePreview: true,
    forceFullTodoistSync: true
  };

  const first = await previewImport(settings, options, snapshotStore);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    method: "POST",
    path: "/api/v1/sync",
    resourceTypes: [
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
    ]
  });

  const cachedSnapshot = await snapshotStore.load();
  const firstCoverage = summarizeCoverage(cachedSnapshot, first.plan);

  const second = await previewImport(settings, {
    ...options,
    forceFullTodoistSync: false
  }, snapshotStore);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].method, "POST");
  assert.equal(calls[1].path, "/api/v1/sync");
  assert.ok(calls[1].resourceTypes.includes("workspace_users"));

  const secondSnapshot = await snapshotStore.load();
  const secondCoverage = summarizeCoverage(secondSnapshot, second.plan);

  await fs.rm(tmpDir, { recursive: true, force: true });

  console.log(JSON.stringify({
    readonly: true,
    todoistCalls: calls.map((call) => ({
      method: call.method,
      path: call.path,
      resourceTypeCount: call.resourceTypes.length
    })),
    fullSyncPreview: {
      source: first.snapshot.source,
      fullSync: first.snapshot.fullSync,
      coverage: firstCoverage
    },
    incrementalPreview: {
      source: second.snapshot.source,
      fullSync: second.snapshot.fullSync,
      coverage: secondCoverage
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
