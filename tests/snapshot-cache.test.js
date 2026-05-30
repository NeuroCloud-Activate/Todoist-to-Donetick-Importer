const assert = require("node:assert/strict");
const { TodoistClient, mergeSyncSnapshot } = require("../src/lib/todoist");

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

async function testFullAndIncrementalSync() {
  const calls = [];
  const fetchImpl = async (_url, options) => {
    const body = options.body.toString();
    calls.push(body);
    if (body.includes("sync_token=*")) {
      return jsonResponse({
        full_sync: true,
        sync_token: "sync-1",
        full_sync_date_utc: "2026-05-30T12:00:00Z",
        projects: [{ id: "p1", name: "Inbox", is_deleted: false }],
        sections: [],
        labels: [{ id: "l1", name: "home", color: "green", is_deleted: false }],
        items: [
          { id: "t1", project_id: "p1", content: "Original", checked: false, is_deleted: false, labels: ["home"], priority: 1 }
        ],
        notes: [{ id: "n1", item_id: "t1", content: "Original note", is_deleted: false }],
        reminders: [],
        reminders_location: []
      });
    }

    assert.match(body, /sync_token=sync-1/);
    return jsonResponse({
      full_sync: false,
      sync_token: "sync-2",
      items: [
        { id: "t1", content: "Updated", checked: false, is_deleted: false },
        { id: "t2", project_id: "p1", content: "Added", checked: false, is_deleted: false, labels: [], priority: 4 }
      ],
      notes: [{ id: "n1", is_deleted: true }]
    });
  };

  const client = new TodoistClient({ token: "token", fetchImpl });
  const first = await client.fetchSnapshot();
  const second = await client.fetchSnapshot({}, first);

  assert.equal(calls.length, 2);
  assert.equal(first.tasks.length, 1);
  assert.equal(second.syncToken, "sync-2");
  assert.equal(second.tasks.length, 2);
  assert.equal(second.tasks.find((task) => task.id === "t1").content, "Updated");
  assert.equal(Object.keys(second.commentsByTask).length, 0);
}

function testCompletedTaskRemovedFromCache() {
  const cached = {
    syncToken: "sync-1",
    tasks: [{ id: "t1", content: "Complete me", checked: false, is_deleted: false }],
    projects: [],
    sections: [],
    labels: [],
    notes: [],
    reminders: [],
    commentsByTask: {}
  };
  const merged = mergeSyncSnapshot(cached, {
    full_sync: false,
    sync_token: "sync-2",
    items: [{ id: "t1", checked: true, is_deleted: false }]
  });
  assert.equal(merged.tasks.length, 0);
}

testFullAndIncrementalSync()
  .then(() => {
    testCompletedTaskRemovedFromCache();
    console.log("snapshot cache tests passed");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
