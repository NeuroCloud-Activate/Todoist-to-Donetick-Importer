function createSimulatedTodoistSnapshot() {
  const fetchedAt = new Date("2026-05-30T12:00:00Z").toISOString();
  const projects = [
    {
      id: "proj-home",
      name: "Home Operations",
      color: "teal",
      child_order: 1,
      is_favorite: true,
      view_style: "list",
      is_archived: false,
      is_deleted: false
    },
    {
      id: "proj-work",
      name: "Work Launch",
      color: "grape",
      child_order: 2,
      is_favorite: false,
      view_style: "board",
      workspace_id: "workspace-1",
      is_archived: false,
      is_deleted: false
    }
  ];

  const sections = [
    {
      id: "sec-home-weekly",
      project_id: "proj-home",
      name: "Weekly Reset",
      section_order: 1,
      is_archived: false,
      is_deleted: false
    },
    {
      id: "sec-work-release",
      project_id: "proj-work",
      name: "Release Prep",
      section_order: 1,
      is_archived: false,
      is_deleted: false
    }
  ];

  const labels = [
    { id: "label-urgent", name: "urgent", color: "red", item_order: 1, is_favorite: true, is_deleted: false },
    { id: "label-home", name: "home", color: "green", item_order: 2, is_favorite: false, is_deleted: false },
    { id: "label-waiting", name: "waiting", color: "orange", item_order: 3, is_favorite: false, is_deleted: false },
    { id: "label-deep-work", name: "deep-work", color: "blue", item_order: 4, is_favorite: false, is_deleted: false }
  ];

  const tasks = [
    {
      user_id: "user-1",
      id: "task-home-parent",
      project_id: "proj-home",
      section_id: "sec-home-weekly",
      parent_id: null,
      added_by_uid: "user-1",
      assigned_by_uid: "user-1",
      responsible_uid: "user-1",
      labels: ["home", "urgent"],
      deadline: { date: "2026-06-08", lang: "en" },
      duration: { amount: 45, unit: "minute" },
      is_collapsed: false,
      checked: false,
      is_deleted: false,
      added_at: "2026-05-20T09:15:00Z",
      completed_at: null,
      completed_by_uid: null,
      updated_at: "2026-05-29T17:30:00Z",
      due: {
        date: "2026-06-01",
        datetime: "2026-06-01T13:00:00Z",
        timezone: "America/Toronto",
        is_recurring: true,
        lang: "en",
        string: "every weekday"
      },
      priority: 4,
      child_order: 1,
      content: "Reset the kitchen and pantry",
      description: "Clean counters, rotate pantry inventory, and restock staples.",
      note_count: 2,
      day_order: 1,
      goal_ids: ["goal-household"]
    },
    {
      user_id: "user-1",
      id: "task-home-child-1",
      project_id: "proj-home",
      section_id: "sec-home-weekly",
      parent_id: "task-home-parent",
      added_by_uid: "user-1",
      assigned_by_uid: "user-1",
      responsible_uid: "user-1",
      labels: ["home"],
      deadline: null,
      duration: { amount: 15, unit: "minute" },
      is_collapsed: false,
      checked: false,
      is_deleted: false,
      added_at: "2026-05-20T09:16:00Z",
      completed_at: null,
      completed_by_uid: null,
      updated_at: "2026-05-29T17:31:00Z",
      due: { date: "2026-06-01", is_recurring: false, lang: "en", string: "Jun 1" },
      priority: 2,
      child_order: 1,
      content: "Check expiring pantry items",
      description: "",
      note_count: 0,
      day_order: 2,
      goal_ids: []
    },
    {
      user_id: "user-1",
      id: "task-home-child-2",
      project_id: "proj-home",
      section_id: "sec-home-weekly",
      parent_id: "task-home-parent",
      added_by_uid: "user-1",
      assigned_by_uid: "user-1",
      responsible_uid: "user-1",
      labels: ["home", "waiting"],
      deadline: null,
      duration: { amount: 1, unit: "day" },
      is_collapsed: false,
      checked: false,
      is_deleted: false,
      added_at: "2026-05-20T09:17:00Z",
      completed_at: null,
      completed_by_uid: null,
      updated_at: "2026-05-29T17:32:00Z",
      due: { date: "2026-06-02", is_recurring: false, lang: "en", string: "Jun 2" },
      priority: 1,
      child_order: 2,
      content: "Add grocery list items",
      description: "Confirm quantities before shopping.",
      note_count: 1,
      day_order: 3,
      goal_ids: []
    },
    {
      user_id: "user-1",
      id: "task-work-release",
      project_id: "proj-work",
      section_id: "sec-work-release",
      parent_id: null,
      added_by_uid: "user-2",
      assigned_by_uid: "user-2",
      responsible_uid: "user-1",
      labels: ["deep-work", "urgent"],
      deadline: { date: "2026-06-05", lang: "en" },
      duration: { amount: 2, unit: "hour" },
      is_collapsed: false,
      checked: false,
      is_deleted: false,
      added_at: "2026-05-22T14:00:00Z",
      completed_at: null,
      completed_by_uid: null,
      updated_at: "2026-05-29T20:00:00Z",
      due: {
        date: "2026-06-03",
        datetime: "2026-06-03T18:00:00Z",
        timezone: "America/Toronto",
        is_recurring: false,
        lang: "en",
        string: "Jun 3 at 2pm"
      },
      priority: 3,
      child_order: 2,
      content: "Prepare launch checklist",
      description: "Verify owners, rollout steps, and rollback plan.",
      note_count: 1,
      day_order: 4,
      goal_ids: ["goal-launch"]
    },
    {
      user_id: "user-1",
      id: "task-unsupported-recurrence",
      project_id: "proj-home",
      section_id: null,
      parent_id: null,
      added_by_uid: "user-1",
      assigned_by_uid: null,
      responsible_uid: null,
      labels: ["home"],
      deadline: null,
      duration: null,
      is_collapsed: false,
      checked: false,
      is_deleted: false,
      added_at: "2026-05-23T08:00:00Z",
      completed_at: null,
      completed_by_uid: null,
      updated_at: "2026-05-29T15:00:00Z",
      due: {
        date: "2026-06-07",
        is_recurring: true,
        lang: "en",
        string: "every first business day"
      },
      priority: 1,
      child_order: 3,
      content: "Review household subscriptions",
      description: "Natural-language recurrence should be preserved if not safely mapped.",
      note_count: 0,
      day_order: 5,
      goal_ids: []
    }
  ];

  const notes = [
    {
      id: "note-1",
      item_id: "task-home-parent",
      posted_uid: "user-1",
      content: "Use the inventory photo from last week.",
      file_attachment: {
        file_name: "pantry-photo.jpg",
        file_type: "image/jpeg",
        file_url: "https://example.invalid/pantry-photo.jpg"
      },
      posted_at: "2026-05-29T17:40:00Z",
      is_deleted: false
    },
    {
      id: "note-2",
      item_id: "task-home-parent",
      posted_uid: "user-2",
      content: "Remember to check pet food too.",
      posted_at: "2026-05-29T17:45:00Z",
      is_deleted: false
    },
    {
      id: "note-3",
      item_id: "task-work-release",
      posted_uid: "user-2",
      content: "Attach the release dashboard before sign-off.",
      posted_at: "2026-05-29T20:10:00Z",
      is_deleted: false
    },
    {
      id: "note-4",
      item_id: "task-home-child-2",
      posted_uid: "user-1",
      content: "Waiting on pantry count.",
      posted_at: "2026-05-29T18:00:00Z",
      is_deleted: false
    }
  ];

  const reminders = [
    {
      id: "reminder-relative",
      item_id: "task-home-parent",
      notify_uid: "user-1",
      is_deleted: false,
      is_urgent: true,
      type: "relative",
      minute_offset: 30,
      due: {
        date: "2026-06-01T12:30:00",
        lang: "en",
        timezone: "America/Toronto"
      }
    },
    {
      id: "reminder-absolute",
      item_id: "task-work-release",
      notify_uid: "user-1",
      is_deleted: false,
      is_urgent: false,
      type: "absolute",
      due: {
        date: "2026-06-03T16:00:00",
        lang: "en",
        timezone: "America/Toronto"
      }
    },
    {
      id: "reminder-location",
      item_id: "task-home-child-2",
      notify_uid: "user-1",
      is_deleted: false,
      is_urgent: false,
      type: "location",
      name: "Grocery store",
      location: {
        name: "Grocery store",
        latitude: 43.6532,
        longitude: -79.3832,
        radius: 100
      }
    }
  ];

  return {
    syncToken: "simulated-sync-token",
    fullSync: true,
    fullSyncDateUtc: fetchedAt,
    fetchedAt,
    tasks,
    projects,
    sections,
    labels,
    notes,
    projectNotes: [],
    reminders,
    collaborators: {
      "user-1": { id: "user-1", full_name: "Primary User", email: "primary@example.invalid" },
      "user-2": { id: "user-2", full_name: "Collaborator", email: "collaborator@example.invalid" }
    },
    collaboratorStates: [
      { project_id: "proj-work", user_id: "user-2", state: "active", is_deleted: false }
    ],
    workspaceUsers: {
      "user-1": { id: "user-1", full_name: "Primary User" },
      "user-2": { id: "user-2", full_name: "Collaborator" }
    },
    user: { id: "user-1", full_name: "Primary User", tz_info: { timezone: "America/Toronto" } },
    userSettings: { timezone: "America/Toronto", date_format: 0 },
    commentsByTask: groupNotesByTask(notes)
  };
}

function groupNotesByTask(notes) {
  const grouped = {};
  for (const note of notes) {
    if (!grouped[note.item_id]) {
      grouped[note.item_id] = [];
    }
    grouped[note.item_id].push(note);
  }
  return grouped;
}

module.exports = {
  createSimulatedTodoistSnapshot
};
