const TODOIST_ID_PATTERN = /Todoist task ID:\s*<\/strong>\s*([^<\s]+)/i;
const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_ALIASES = {
  sun: "sunday",
  sunday: "sunday",
  mon: "monday",
  monday: "monday",
  tue: "tuesday",
  tues: "tuesday",
  tuesday: "tuesday",
  wed: "wednesday",
  weds: "wednesday",
  wednesday: "wednesday",
  thu: "thursday",
  thur: "thursday",
  thurs: "thursday",
  thursday: "thursday",
  fri: "friday",
  friday: "friday",
  sat: "saturday",
  saturday: "saturday"
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraphize(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function buildMaps(snapshot) {
  return {
    projectsById: new Map(asArray(snapshot.projects).map((project) => [project.id, project])),
    sectionsById: new Map(asArray(snapshot.sections).map((section) => [section.id, section])),
    labelsByName: new Map(asArray(snapshot.labels).map((label) => [label.name, label])),
    remindersByTaskId: groupBy(asArray(snapshot.reminders), (reminder) => reminder.item_id || reminder.task_id),
    commentsByTaskId: snapshot.commentsByTask || {},
    childrenByParentId: groupBy(asArray(snapshot.tasks), (task) => task.parent_id)
  };
}

function groupBy(items, getKey) {
  const grouped = {};
  for (const item of items) {
    const key = getKey(item);
    if (!key) {
      continue;
    }
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(item);
  }
  return grouped;
}

function localDateToIso(date, defaultDueTime = "09:00") {
  if (!date) {
    return null;
  }

  if (/\d{4}-\d{2}-\d{2}T/.test(date)) {
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const time = /^\d{2}:\d{2}$/.test(defaultDueTime) ? defaultDueTime : "09:00";
    const parsed = new Date(`${date}T${time}:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function todoistDueToDonetick(task, options = {}) {
  const due = task.due || {};
  return localDateToIso(due.datetime || due.date, options.defaultDueTime);
}

function mapPriority(todoistPriority) {
  const priority = Number(todoistPriority || 1);
  if (priority <= 1) {
    return 0;
  }
  if (priority >= 4) {
    return 5;
  }
  return Math.round((priority - 1) * (5 / 3));
}

function recurrenceTime(nextDueDate) {
  const value = nextDueDate || new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  }
  return parsed.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function parseRecurrence(due, nextDueDate) {
  if (!due || !due.is_recurring) {
    return {
      frequencyType: "once",
      frequency: 1,
      frequencyMetadata: null,
      warnings: []
    };
  }

  const raw = String(due.string || "").trim();
  const normalized = raw.toLowerCase();
  const warnings = [];

  if (!normalized) {
    return unsupportedRecurrence(raw, warnings);
  }

  if (normalized === "every day" || normalized === "daily") {
    return recurring("daily", 1, null, warnings);
  }
  if (normalized === "every week" || normalized === "weekly") {
    return recurring("weekly", 1, null, warnings);
  }
  if (normalized === "every month" || normalized === "monthly") {
    return recurring("monthly", 1, null, warnings);
  }
  if (normalized === "every year" || normalized === "yearly" || normalized === "annually") {
    return recurring("yearly", 1, null, warnings);
  }

  const intervalMatch = normalized.match(/^every\s+(\d+)\s+(hour|hours|day|days|week|weeks|month|months|year|years)$/);
  if (intervalMatch) {
    const unit = pluralizeUnit(intervalMatch[2]);
    return recurring("interval", Number(intervalMatch[1]), {
      unit,
      time: recurrenceTime(nextDueDate)
    }, warnings);
  }

  if (normalized === "every weekday" || normalized === "every workday") {
    return recurring("days_of_the_week", 1, {
      days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      time: recurrenceTime(nextDueDate),
      weekPattern: "every_week"
    }, warnings);
  }

  if (normalized === "every weekend") {
    return recurring("days_of_the_week", 1, {
      days: ["saturday", "sunday"],
      time: recurrenceTime(nextDueDate),
      weekPattern: "every_week"
    }, warnings);
  }

  const days = parseDayList(normalized);
  if (days.length) {
    return recurring("days_of_the_week", 1, {
      days,
      time: recurrenceTime(nextDueDate),
      weekPattern: "every_week"
    }, warnings);
  }

  return unsupportedRecurrence(raw, warnings);
}

function recurring(frequencyType, frequency, frequencyMetadata, warnings) {
  return { frequencyType, frequency, frequencyMetadata, warnings };
}

function unsupportedRecurrence(raw, warnings) {
  warnings.push(`Recurring schedule "${raw || "unknown"}" was preserved in the description and imported as one-time.`);
  return {
    frequencyType: "once",
    frequency: 1,
    frequencyMetadata: null,
    warnings
  };
}

function pluralizeUnit(unit) {
  if (unit.endsWith("s")) {
    return unit;
  }
  return `${unit}s`;
}

function parseDayList(normalized) {
  if (!normalized.startsWith("every ")) {
    return [];
  }
  const text = normalized
    .replace(/^every\s+/, "")
    .replace(/\band\b/g, ",")
    .replace(/&/g, ",");
  const tokens = text.split(/[,\s]+/).filter(Boolean);
  if (!tokens.length) {
    return [];
  }
  const days = tokens.map((token) => DAY_ALIASES[token]).filter(Boolean);
  return days.length === tokens.length ? [...new Set(days)] : [];
}

function todoistTaskUrl(task) {
  if (task.url) {
    return task.url;
  }
  return task.id ? `https://app.todoist.com/app/task/${task.id}` : "";
}

function compactMetadataRows(rows) {
  return rows
    .filter((row) => row[1] !== undefined && row[1] !== null && row[1] !== "" && !(Array.isArray(row[1]) && row[1].length === 0))
    .map(([label, value]) => `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(formatValue(value))}</li>`)
    .join("");
}

function formatValue(value) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

function buildDescription({ task, project, section, comments, reminders, childTasks, childTaskDetails, warnings }) {
  const labels = asArray(task.labels);
  const sourceUrl = todoistTaskUrl(task);
  const due = task.due || {};
  const assigneeSummary = [
    task.added_by_uid ? `added by ${task.added_by_uid}` : "",
    task.assigned_by_uid ? `assigned by ${task.assigned_by_uid}` : "",
    task.responsible_uid ? `responsible ${task.responsible_uid}` : ""
  ].filter(Boolean).join("; ");
  const metadata = compactMetadataRows([
    ["Todoist task ID", task.id],
    ["Todoist user ID", task.user_id],
    ["Todoist project", project && project.name],
    ["Todoist project ID", task.project_id],
    ["Todoist section", section && section.name],
    ["Todoist section ID", task.section_id],
    ["Todoist labels", labels],
    ["Todoist priority", task.priority],
    ["Todoist due", due.string || due.date || due.datetime],
    ["Todoist due metadata", due && Object.keys(due).length ? due : null],
    ["Todoist recurring", due.is_recurring ? "yes" : "no"],
    ["Todoist deadline", task.deadline && (task.deadline.date || task.deadline.datetime || task.deadline.string)],
    ["Todoist duration", task.duration && `${task.duration.amount} ${task.duration.unit}`],
    ["Todoist assignment", assigneeSummary],
    ["Todoist parent task ID", task.parent_id],
    ["Todoist order", task.child_order || task.order],
    ["Todoist day order", task.day_order],
    ["Todoist collapsed", task.is_collapsed],
    ["Todoist checked", task.checked],
    ["Todoist completed at", task.completed_at],
    ["Todoist completed by", task.completed_by_uid],
    ["Todoist goals", task.goal_ids],
    ["Todoist added", task.added_at],
    ["Todoist updated", task.updated_at],
    ["Todoist URL", sourceUrl]
  ]);

  const commentHtml = asArray(comments)
    .map((comment) => {
      const attachment = comment.file_attachment || comment.attachment;
      const attachmentText = attachment ? `<p><em>Attachment: ${escapeHtml(formatValue(attachment))}</em></p>` : "";
      return `<blockquote><p><strong>${escapeHtml(comment.posted_at || "Comment")}:</strong></p>${paragraphize(comment.content)}${attachmentText}</blockquote>`;
    })
    .join("");

  const reminderHtml = asArray(reminders)
    .map((reminder) => `<li>${escapeHtml(formatValue({
      id: reminder.id,
      type: reminder.type || reminder.reminder_type,
      due: reminder.due,
      minute_offset: reminder.minute_offset,
      is_urgent: reminder.is_urgent,
      location: reminder.location || reminder.name || null
    }))}</li>`)
    .join("");

  const childHtml = asArray(childTaskDetails && childTaskDetails.length ? childTaskDetails : asArray(childTasks).map((child) => ({ task: child, comments: [], reminders: [] })))
    .map(({ task: child, comments: childComments, reminders: childReminders }) => {
      const childDue = child.due || {};
      const childMetadata = compactMetadataRows([
        ["Todoist subtask ID", child.id],
        ["Todoist parent task ID", child.parent_id],
        ["Todoist labels", child.labels],
        ["Todoist priority", child.priority],
        ["Todoist due", childDue.string || childDue.date || childDue.datetime],
        ["Todoist due metadata", childDue && Object.keys(childDue).length ? childDue : null],
        ["Todoist deadline", child.deadline && (child.deadline.date || child.deadline.datetime || child.deadline.string)],
        ["Todoist duration", child.duration && `${child.duration.amount} ${child.duration.unit}`],
        ["Todoist order", child.child_order || child.order],
        ["Todoist day order", child.day_order],
        ["Todoist added", child.added_at],
        ["Todoist updated", child.updated_at],
        ["Todoist URL", todoistTaskUrl(child)]
      ]);
      const childCommentsHtml = asArray(childComments)
        .map((comment) => `<blockquote>${paragraphize(comment.content)}<p><em>${escapeHtml(comment.posted_at || "Comment")}</em></p></blockquote>`)
        .join("");
      const childReminderHtml = asArray(childReminders)
        .map((reminder) => `<li>${escapeHtml(formatValue({
          id: reminder.id,
          type: reminder.type || reminder.reminder_type,
          due: reminder.due,
          minute_offset: reminder.minute_offset,
          is_urgent: reminder.is_urgent,
          location: reminder.location || reminder.name || null
        }))}</li>`)
        .join("");
      return [
        "<li>",
        `<strong>${escapeHtml(child.content || "(Untitled subtask)")}</strong>`,
        paragraphize(child.description),
        childMetadata ? `<ul>${childMetadata}</ul>` : "",
        childCommentsHtml ? `<h5>Subtask comments</h5>${childCommentsHtml}` : "",
        childReminderHtml ? `<h5>Subtask reminders</h5><ul>${childReminderHtml}</ul>` : "",
        "</li>"
      ].filter(Boolean).join("");
    })
    .join("");

  const warningHtml = asArray(warnings)
    .map((warning) => `<li>${escapeHtml(warning)}</li>`)
    .join("");

  return [
    paragraphize(task.description),
    "<hr>",
    "<h3>Imported from Todoist</h3>",
    `<ul>${metadata}</ul>`,
    warningHtml ? `<h4>Import notes</h4><ul>${warningHtml}</ul>` : "",
    childHtml ? `<h4>Todoist subtasks</h4><ul>${childHtml}</ul>` : "",
    commentHtml ? `<h4>Todoist comments</h4>${commentHtml}` : "",
    reminderHtml ? `<h4>Todoist reminders</h4><ul>${reminderHtml}</ul>` : ""
  ].filter(Boolean).join("");
}

function extractTodoistIdFromChore(chore) {
  const description = String(chore.description || "");
  const match = description.match(TODOIST_ID_PATTERN);
  return match ? match[1] : null;
}

function createExistingTodoistIdSet(chores = []) {
  return new Set(asArray(chores).map(extractTodoistIdFromChore).filter(Boolean));
}

function taskLabelNames(tasks) {
  return [...new Set(asArray(tasks).flatMap((task) => asArray(task.labels)).filter(Boolean))];
}

function mapSubtask(child, order) {
  return {
    id: -(order + 1),
    orderId: order + 1,
    name: child.content || "(Untitled Todoist subtask)"
  };
}

function mapTaskToDonetick(task, snapshot, options = {}, mappings = {}) {
  const maps = buildMaps(snapshot);
  const project = maps.projectsById.get(task.project_id);
  const section = maps.sectionsById.get(task.section_id);
  const comments = options.includeComments === false ? [] : maps.commentsByTaskId[task.id] || [];
  const reminders = options.includeReminders === false ? [] : maps.remindersByTaskId[task.id] || [];
  const childTasks = maps.childrenByParentId[task.id] || [];
  const childTaskDetails = childTasks.map((child) => ({
    task: child,
    comments: options.includeComments === false ? [] : maps.commentsByTaskId[child.id] || [],
    reminders: options.includeReminders === false ? [] : maps.remindersByTaskId[child.id] || []
  }));
  const nextDueDate = todoistDueToDonetick(task, options);
  const recurrence = parseRecurrence(task.due, nextDueDate);
  const warnings = [...recurrence.warnings];

  const description = buildDescription({
    task,
    project,
    section,
    comments,
    reminders,
    childTasks,
    childTaskDetails,
    warnings
  });

  const labelsV2 = asArray(task.labels)
    .map((labelName) => mappings.labelIdByName && mappings.labelIdByName.get(labelName))
    .filter(Boolean)
    .map((id) => ({ id }));

  const payload = {
    name: task.content || "(Untitled Todoist task)",
    frequencyType: recurrence.frequencyType,
    frequency: recurrence.frequency,
    frequencyMetadata: recurrence.frequencyMetadata || undefined,
    nextDueDate: nextDueDate || undefined,
    isRolling: false,
    assignStrategy: "no_assignee",
    isActive: true,
    notification: false,
    description,
    priority: mapPriority(task.priority),
    requireApproval: false,
    isPrivate: false
  };

  if (mappings.projectIdByTodoistId && mappings.projectIdByTodoistId.get(task.project_id)) {
    payload.projectId = mappings.projectIdByTodoistId.get(task.project_id);
  }

  if (labelsV2.length) {
    payload.labelsV2 = labelsV2;
  }

  if (options.subtasksAsDonetick && childTasks.length) {
    payload.subTasks = childTasks.map(mapSubtask);
  }

  return {
    sourceId: task.id,
    title: payload.name,
    projectName: project ? project.name : "",
    sectionName: section ? section.name : "",
    labels: asArray(task.labels),
    due: task.due || null,
    isRecurring: Boolean(task.due && task.due.is_recurring),
    warnings,
    payload,
    simplePayload: {
      name: payload.name,
      dueDate: task.due && (task.due.datetime || task.due.date) ? task.due.datetime || task.due.date : "",
      description
    },
    childTaskIds: childTasks.map((child) => child.id)
  };
}

function buildImportPlan(snapshot, options = {}, mappings = {}, selectedTaskIds = null) {
  const selected = selectedTaskIds ? new Set(selectedTaskIds) : null;
  const maps = buildMaps(snapshot);
  const items = [];

  for (const task of asArray(snapshot.tasks)) {
    if (selected && !selected.has(task.id)) {
      continue;
    }
    if (options.subtasksAsDonetick && task.parent_id && maps.childrenByParentId[task.parent_id]) {
      const parentSelected = !selected || selected.has(task.parent_id);
      if (parentSelected) {
        continue;
      }
    }
    items.push(mapTaskToDonetick(task, snapshot, options, mappings));
  }

  return {
    items,
    totals: {
      todoistTasks: asArray(snapshot.tasks).length,
      plannedChores: items.length,
      projects: asArray(snapshot.projects).length,
      sections: asArray(snapshot.sections).length,
      labels: taskLabelNames(snapshot.tasks).length
    }
  };
}

module.exports = {
  buildDescription,
  buildImportPlan,
  buildMaps,
  createExistingTodoistIdSet,
  escapeHtml,
  extractTodoistIdFromChore,
  mapPriority,
  mapTaskToDonetick,
  parseRecurrence,
  parseDayList,
  taskLabelNames,
  todoistDueToDonetick
};
