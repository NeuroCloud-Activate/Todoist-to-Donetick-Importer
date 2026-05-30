const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { DonetickClient } = require("../src/lib/donetick");
const { previewImport, runImport } = require("../src/lib/importService");
const { createSimulatedTodoistSnapshot } = require("../src/lib/simulatedTodoistSnapshot");
const { createSnapshotStore } = require("../src/lib/snapshotStore");

if (process.env.RUN_LIVE_DONETICK_AUDIT !== "1") {
  console.log("Skipping live Donetick audit. Set RUN_LIVE_DONETICK_AUDIT=1 to run.");
  process.exit(0);
}

const baseUrl = process.env.DONETICK_BASE_URL;
const apiKey = process.env.DONETICK_API_KEY;
assert.ok(baseUrl, "DONETICK_BASE_URL is required.");
assert.ok(apiKey, "DONETICK_API_KEY is required.");

const auditId = `td-import-audit-${Date.now()}`;
const titlePrefix = `[TD Import Audit ${auditId}]`;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeAuditSnapshot() {
  const snapshot = clone(createSimulatedTodoistSnapshot());
  const labelRename = new Map();

  snapshot.projects = snapshot.projects.map((project) => ({
    ...project,
    id: `${auditId}-${project.id}`,
    name: `${titlePrefix} ${project.name}`
  }));

  snapshot.sections = snapshot.sections.map((section) => ({
    ...section,
    id: `${auditId}-${section.id}`,
    project_id: `${auditId}-${section.project_id}`,
    name: `${titlePrefix} ${section.name}`
  }));

  snapshot.labels = snapshot.labels.map((label) => {
    const name = `${auditId}-${label.name}`;
    labelRename.set(label.name, name);
    return {
      ...label,
      id: `${auditId}-${label.id}`,
      name
    };
  });

  snapshot.tasks = snapshot.tasks.map((task) => ({
    ...task,
    id: `${auditId}-${task.id}`,
    project_id: `${auditId}-${task.project_id}`,
    section_id: task.section_id ? `${auditId}-${task.section_id}` : null,
    parent_id: task.parent_id ? `${auditId}-${task.parent_id}` : null,
    labels: (task.labels || []).map((label) => labelRename.get(label) || `${auditId}-${label}`),
    content: `${titlePrefix} ${task.content}`
  }));

  snapshot.notes = snapshot.notes.map((note) => ({
    ...note,
    id: `${auditId}-${note.id}`,
    item_id: `${auditId}-${note.item_id}`
  }));

  snapshot.reminders = snapshot.reminders.map((reminder) => ({
    ...reminder,
    id: `${auditId}-${reminder.id}`,
    item_id: `${auditId}-${reminder.item_id}`
  }));

  snapshot.commentsByTask = {};
  for (const note of snapshot.notes) {
    if (!snapshot.commentsByTask[note.item_id]) {
      snapshot.commentsByTask[note.item_id] = [];
    }
    snapshot.commentsByTask[note.item_id].push(note);
  }

  snapshot.syncToken = `${auditId}-sync-token`;
  snapshot.fetchedAt = new Date().toISOString();
  return snapshot;
}

async function deleteMatchingChores(client) {
  const chores = await client.getChores("full");
  const matches = chores.filter((chore) => {
    return String(chore.name || "").includes(titlePrefix) || String(chore.description || "").includes(auditId);
  });

  for (const chore of matches) {
    await client.request(`/api/v1/chores/${chore.id}`, { method: "DELETE" });
  }
  return matches.length;
}

async function deleteMatchingProjects(client) {
  const projects = await client.getProjects();
  const matches = projects.filter((project) => String(project.name || "").includes(titlePrefix));
  for (const project of matches) {
    await client.request(`/api/v1/projects/${project.id}`, { method: "DELETE" });
  }
  return matches.length;
}

async function deleteMatchingLabels(client) {
  try {
    const labels = await client.getLabels();
    const matches = labels.filter((label) => String(label.name || "").startsWith(auditId));
    for (const label of matches) {
      await client.request(`/api/v1/labels/${label.id}`, { method: "DELETE" });
    }
    return matches.length;
  } catch (error) {
    return `not available (${error.status || "unknown"})`;
  }
}

async function main() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "todoist-donetick-audit-"));
  const snapshotStore = createSnapshotStore(tmpDir);
  const snapshot = makeAuditSnapshot();
  await snapshotStore.save(snapshot);

  const settings = {
    todoistApiBase: "https://api.todoist.com/api/v1",
    todoistToken: "",
    donetickBaseUrl: baseUrl,
    donetickApiKey: apiKey,
    importOptions: {}
  };
  const fullOptions = {
    donetickMode: "full",
    includeComments: true,
    includeReminders: true,
    createProjects: true,
    createLabels: true,
    subtasksAsDonetick: true,
    skipDuplicates: true,
    defaultDueTime: "09:00",
    syncTodoistBeforePreview: false
  };

  const client = new DonetickClient({ baseUrl, apiKey });
  let summary = {};
  let simpleId = null;

  try {
    const initialChores = await client.getChores("full");
    const preview = await previewImport(settings, fullOptions, snapshotStore);
    assert.equal(preview.snapshot.source, "cache");
    assert.equal(preview.plan.totals.plannedChores, 3);

    const selectedTaskIds = preview.plan.items.map((item) => item.sourceId);
    const previewEdits = [
      {
        sourceId: selectedTaskIds[0],
        name: `${titlePrefix} edited preview chore`,
        priority: 4,
        description: `<p>${auditId} edited from preview before import.</p>`
      }
    ];
    const imported = await runImport(settings, fullOptions, selectedTaskIds, snapshotStore, previewEdits);
    assert.equal(imported.totals.failed, 0);
    assert.equal(imported.totals.created, 3);

    const afterImportChores = await client.getChores("full");
    const auditChores = afterImportChores.filter((chore) => String(chore.name || "").includes(titlePrefix));
    assert.equal(auditChores.length, 3);
    assert.ok(auditChores.some((chore) => String(chore.name || "").includes("edited preview chore")));
    assert.ok(auditChores.some((chore) => String(chore.description || "").includes("edited from preview before import")));
    assert.ok(auditChores.some((chore) => String(chore.description || "").includes("Todoist reminders")));
    assert.ok(auditChores.some((chore) => String(chore.description || "").includes("Todoist comments")));
    assert.ok(auditChores.some((chore) => String(chore.description || "").includes("every first business day")));
    assert.ok(auditChores.some((chore) => String(chore.description || "").includes("Waiting on pantry count")));
    assert.ok(auditChores.some((chore) => String(chore.description || "").includes("Grocery store")));

    const duplicateRun = await runImport(settings, fullOptions, selectedTaskIds, snapshotStore);
    assert.equal(duplicateRun.totals.created, 0);
    assert.equal(duplicateRun.totals.skipped, 3);

    const simpleItem = {
      simplePayload: {
        name: `${titlePrefix} simple external API chore`,
        dueDate: "2026-06-10",
        description: `<p>${auditId} simple external API smoke test</p><h3>Imported from Todoist</h3><ul><li><strong>Todoist task ID:</strong> ${auditId}-simple</li></ul>`
      }
    };
    const simpleCreated = await client.createChore(simpleItem, "simple");
    simpleId = simpleCreated && (simpleCreated.id || simpleCreated);
    assert.ok(simpleId, "Simple API did not return a chore id.");
    await client.request(`/eapi/v1/chore/${simpleId}`, { method: "DELETE" });
    simpleId = null;

    summary = {
      auditId,
      initialChores: initialChores.length,
      preview: preview.snapshot,
      importTotals: imported.totals,
      setupWarnings: imported.preparationWarnings,
      duplicateTotals: duplicateRun.totals,
      simpleApiCreatedAndDeleted: true
    };
  } finally {
    if (simpleId) {
      try {
        await client.request(`/eapi/v1/chore/${simpleId}`, { method: "DELETE" });
      } catch (_error) {
        // Best-effort cleanup continues below by marker scan.
      }
    }
    const cleanup = {
      choresDeleted: await deleteMatchingChores(client),
      projectsDeleted: await deleteMatchingProjects(client),
      labelsDeleted: await deleteMatchingLabels(client)
    };
    const finalChores = await client.getChores("full");
    console.log(JSON.stringify({
      ...summary,
      cleanup,
      finalChores: finalChores.length
    }, null, 2));
  }
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
