const assert = require("node:assert/strict");
const {
  buildImportPlan,
  createExistingTodoistIdSet,
  mapPriority,
  parseRecurrence,
  todoistDueToDonetick
} = require("../src/lib/mapper");
const { createSimulatedTodoistSnapshot } = require("../src/lib/simulatedTodoistSnapshot");

function testDueConversion() {
  const iso = todoistDueToDonetick(
    { due: { date: "2026-06-05" } },
    { defaultDueTime: "10:30" }
  );
  assert.match(iso, /^2026-06-05T/);
}

function testRecurrence() {
  assert.equal(parseRecurrence({ is_recurring: true, string: "every day" }, "2026-06-05T10:30:00.000Z").frequencyType, "daily");

  const interval = parseRecurrence({ is_recurring: true, string: "every 3 weeks" }, "2026-06-05T10:30:00.000Z");
  assert.equal(interval.frequencyType, "interval");
  assert.equal(interval.frequency, 3);
  assert.deepEqual(interval.frequencyMetadata.unit, "weeks");

  const weekday = parseRecurrence({ is_recurring: true, string: "every monday" }, "2026-06-05T10:30:00.000Z");
  assert.equal(weekday.frequencyType, "days_of_the_week");
  assert.deepEqual(weekday.frequencyMetadata.days, ["monday"]);

  const workday = parseRecurrence({ is_recurring: true, string: "every workday" }, "2026-06-05T10:30:00.000Z");
  assert.equal(workday.frequencyType, "days_of_the_week");
  assert.deepEqual(workday.frequencyMetadata.days, ["monday", "tuesday", "wednesday", "thursday", "friday"]);

  const multiDay = parseRecurrence({ is_recurring: true, string: "every Mon, Wed and Fri" }, "2026-06-05T10:30:00.000Z");
  assert.equal(multiDay.frequencyType, "days_of_the_week");
  assert.deepEqual(multiDay.frequencyMetadata.days, ["monday", "wednesday", "friday"]);

  const unsupported = parseRecurrence({ is_recurring: true, string: "every first business day" }, "2026-06-05T10:30:00.000Z");
  assert.equal(unsupported.frequencyType, "once");
  assert.equal(unsupported.warnings.length, 1);
}

function testPriorityMapping() {
  assert.equal(mapPriority(1), 0);
  assert.equal(mapPriority(2), 2);
  assert.equal(mapPriority(3), 3);
  assert.equal(mapPriority(4), 5);
}

function testPlanSubtasks() {
  const snapshot = {
    tasks: [
      { id: "parent", content: "Parent", project_id: "p1", priority: 1, labels: [] },
      { id: "child", content: "Child", project_id: "p1", parent_id: "parent", priority: 2, labels: [] }
    ],
    projects: [{ id: "p1", name: "Home" }],
    sections: [],
    labels: [],
    reminders: [],
    commentsByTask: {}
  };
  const plan = buildImportPlan(snapshot, { subtasksAsDonetick: true });
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].payload.subTasks.length, 1);
  assert.equal(plan.items[0].payload.subTasks[0].name, "Child");
}

function testDuplicateExtraction() {
  const set = createExistingTodoistIdSet([
    {
      description: "<h3>Imported from Todoist</h3><ul><li><strong>Todoist task ID:</strong> abc123</li></ul>"
    }
  ]);
  assert.equal(set.has("abc123"), true);
}

function testSimulatedTodoistComponents() {
  const snapshot = createSimulatedTodoistSnapshot();
  const plan = buildImportPlan(snapshot, {
    includeComments: true,
    includeReminders: true,
    subtasksAsDonetick: true,
    defaultDueTime: "09:00"
  });

  assert.equal(snapshot.tasks.length, 5);
  assert.equal(plan.items.length, 3);

  const parent = plan.items.find((item) => item.sourceId === "task-home-parent");
  assert.ok(parent);
  assert.equal(parent.payload.frequencyType, "days_of_the_week");
  assert.equal(parent.payload.priority, 5);
  assert.equal(parent.payload.subTasks.length, 2);
  assert.match(parent.payload.description, /^<p>Clean counters, rotate pantry inventory, and restock staples\.<\/p>/);
  assert.match(parent.payload.description, /Todoist deadline/);
  assert.match(parent.payload.description, /Todoist duration/);
  assert.match(parent.payload.description, /Todoist assignment/);
  assert.match(parent.payload.description, /Todoist comments/);
  assert.match(parent.payload.description, /Todoist reminders/);
  assert.match(parent.payload.description, /pantry-photo\.jpg/);
  assert.match(parent.payload.description, /Confirm quantities before shopping/);
  assert.match(parent.payload.description, /Waiting on pantry count/);
  assert.match(parent.payload.description, /Grocery store/);

  const unsupported = plan.items.find((item) => item.sourceId === "task-unsupported-recurrence");
  assert.equal(unsupported.payload.frequencyType, "once");
  assert.equal(unsupported.warnings.length, 1);
  assert.match(unsupported.payload.description, /every first business day/);
}

testDueConversion();
testRecurrence();
testPriorityMapping();
testPlanSubtasks();
testDuplicateExtraction();
testSimulatedTodoistComponents();

console.log("mapper tests passed");
