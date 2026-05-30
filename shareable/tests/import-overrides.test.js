const assert = require("node:assert/strict");
const { applyItemOverrides, ensureTodoistMarker } = require("../src/lib/importService");
const { buildImportPlan } = require("../src/lib/mapper");

const snapshot = {
  tasks: [
    {
      id: "task-1",
      content: "Original Todoist task",
      description: "Todoist description body",
      project_id: "project-1",
      priority: 2,
      due: { date: "2026-06-05", string: "Jun 5" },
      labels: ["home"]
    }
  ],
  projects: [{ id: "project-1", name: "Home" }],
  sections: [],
  labels: [{ id: "label-1", name: "home" }],
  reminders: [],
  commentsByTask: {}
};

function testPreviewOverridesReachPayloads() {
  const plan = buildImportPlan(snapshot, { defaultDueTime: "09:00" });
  const edited = applyItemOverrides(plan.items, [
    {
      sourceId: "task-1",
      name: "Edited Donetick chore",
      nextDueDate: "2026-07-01T15:45:00.000Z",
      priority: 4,
      description: "<p>Edited Donetick description</p>"
    }
  ])[0];

  assert.equal(edited.title, "Edited Donetick chore");
  assert.equal(edited.payload.name, "Edited Donetick chore");
  assert.equal(edited.simplePayload.name, "Edited Donetick chore");
  assert.equal(edited.payload.nextDueDate, "2026-07-01T15:45:00.000Z");
  assert.equal(edited.simplePayload.dueDate, "2026-07-01");
  assert.equal(edited.payload.priority, 4);
  assert.match(edited.payload.description, /Edited Donetick description/);
  assert.match(edited.payload.description, /Todoist task ID:<\/strong> task-1/);
  assert.equal(edited.simplePayload.description, edited.payload.description);
}

function testMarkerIsNotDuplicated() {
  const description = "<p>Keep me</p><hr><h3>Imported from Todoist</h3><ul><li><strong>Todoist task ID:</strong> task-1</li></ul>";
  assert.equal(ensureTodoistMarker(description, "task-1"), description);
}

function testInvalidOverrideValidation() {
  const plan = buildImportPlan(snapshot, { defaultDueTime: "09:00" });
  assert.throws(() => applyItemOverrides(plan.items, [{ sourceId: "task-1", name: "" }]), /name is required/);
  assert.throws(() => applyItemOverrides(plan.items, [{ sourceId: "task-1", nextDueDate: "nope" }]), /due date is invalid/);
  assert.throws(() => applyItemOverrides(plan.items, [{ sourceId: "task-1", priority: "high" }]), /priority is invalid/);
}

testPreviewOverridesReachPayloads();
testMarkerIsNotDuplicated();
testInvalidOverrideValidation();

console.log("import override tests passed");
