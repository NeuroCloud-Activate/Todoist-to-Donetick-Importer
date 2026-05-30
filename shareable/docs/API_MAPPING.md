# API Mapping

## Todoist Read Side

The importer uses Todoist API v1 with bearer token authentication. Its primary read path is the Sync API:

- `POST /api/v1/sync`

On the first read, the app sends `sync_token=*` for a full snapshot. After that, the app stores the returned `sync_token` and requests only incremental changes. The local snapshot contains active tasks, projects, sections, labels, task comments, project comments, reminders, location reminders, collaborators, collaborator states, user data, and user settings.

The older separate REST reads are intentionally avoided for normal import work because they require more calls and make comments/reminders especially expensive.

## Donetick Write Side

Preferred mode uses Donetick's authenticated full API. The importer tries JWT bearer authentication first, using either Donetick username/password login or a pasted JWT token, then falls back to the `secretkey` API-key header for full API endpoints that support it:

- `GET /api/v1/chores/`
- `POST /api/v1/chores/`
- `GET /api/v1/projects`
- `POST /api/v1/projects`
- `GET /api/v1/labels`
- `POST /api/v1/labels`

Simple external API mode is only a final fallback and uses:

- `GET /eapi/v1/chore`
- `POST /eapi/v1/chore`

Simple mode can only write name, due date, and description, so it cannot create native labels, projects, subtasks, or recurrence metadata.

Some Donetick versions protect label endpoints with JWT-only middleware while chore/project endpoints accept `secretkey`. On those servers, native label creation requires Donetick username/password login so the app can request a JWT. If label creation or matching returns an authorization or route error, import continues without Donetick label assignment, preserves Todoist label data in chore descriptions, and reports a setup warning.

## Field Translation

| Todoist field | Donetick field |
| --- | --- |
| `content` | `name` |
| `description` | `description` HTML |
| `due.date` / `due.datetime` | `nextDueDate` or `dueDate` |
| `due.is_recurring` + simple `due.string` | `frequencyType`, `frequency`, `frequencyMetadata` when safely recognized |
| `priority` | `priority` |
| `labels` | `labelsV2` when full mode and label creation/matching is enabled |
| `project_id` | `projectId` when full mode and project creation/matching is enabled |
| direct children | Donetick `subTasks` when enabled; child metadata/comments/reminders are preserved in parent `description` |
| comments/reminders/deadline/duration/source IDs | structured import note in `description` |
| `added_by_uid` / `assigned_by_uid` / `responsible_uid` | structured import note in `description` |
| `goal_ids`, `day_order`, `child_order`, `is_collapsed`, completion fields | structured import note in `description` |

Todoist task descriptions are placed at the top of the generated Donetick HTML description. The preview table then lets the user edit the Donetick description before import. If the user removes the import metadata while editing, the importer re-adds the `Todoist task ID` marker so duplicate detection still works.

## Recurrence Handling

The importer safely maps only simple Todoist recurring phrases:

- `every day` or `daily` to Donetick `daily`
- `every week` or `weekly` to Donetick `weekly`
- `every month` or `monthly` to Donetick `monthly`
- `every year` or `yearly` to Donetick `yearly`
- `every N days/weeks/months/years` to Donetick `interval`
- `every monday`, `every tuesday`, etc. to Donetick `days_of_the_week`
- `every weekday` or `every workday` to Monday-Friday `days_of_the_week`
- comma-separated weekday patterns such as `every Mon, Wed and Fri` to `days_of_the_week`

Unsupported natural-language recurrence is preserved in the description and imported as a one-time chore to avoid creating an incorrect schedule.

## Snapshot Cache

The cache stores Todoist's normalized Sync API data in Electron's user data directory, not in this repository. Preview refreshes the cache by default. Import reuses the cached snapshot from preview so the user imports exactly what they reviewed and avoids an extra Todoist read.

Use the app's cache controls to:

- clear the cached Todoist snapshot,
- force a full sync on the next preview.

## Duplicate Detection

Every imported chore description includes a visible `Todoist task ID` marker. Before import, existing Donetick chores are scanned for the marker so already-imported tasks can be skipped.

## Private Data

This shareable project intentionally contains no Donetick server address, Donetick API key, Todoist token, or personal Todoist data.
