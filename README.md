# Todoist to Donetick Importer

A simple macOS app for moving active Todoist tasks into Donetick with a preview step before anything is created.

FYI: This project was built collaboratively using AI through OpenAI Codex.

## Download

Download the latest macOS app from the GitHub releases page:

[Todoist to Donetick Importer releases](https://github.com/NeuroCloud-Activate/Todoist-to-Donetick-Importer/releases)

The release includes a portable `.app` bundle in a zip file. Unzip it, open the app, and keep the app data folder next to the app if you want saved settings and cached Todoist data to travel with it.

## What It Does

- Reads your active Todoist tasks without changing anything in Todoist.
- Uses a local Todoist snapshot so previewing and importing do not keep calling the Todoist API.
- Shows a preview table before import.
- Lets you edit the Donetick name, due date, priority, and description before creating chores.
- Imports into Donetick using the best available connection method.
- Preserves Todoist details that Donetick does not directly support inside the Donetick chore description.

## What You Need

- A Todoist API token.
- Your Donetick server URL.
- Donetick login details for the best import results:
  - Username and password, or an existing JWT token, are preferred.
  - A Donetick API key can be used as a fallback.

JWT authentication is preferred because some Donetick servers require it for native labels and other full API features.

## How To Use It

1. Open the app.
2. Enter your Todoist API token.
3. Enter your Donetick server URL.
4. Enter Donetick authentication details. Use username/password or a JWT token first, and keep the API key as a fallback.
5. Click **Test Connections**.
6. Click **Preview Todoist Tasks**.
7. Review the table and edit any Donetick fields you want to change.
8. Select the rows you want to import.
9. Click **Import Selected**.

Example: a Todoist task with a description, labels, comments, reminders, and a due date becomes a Donetick chore with the editable title, due date, priority, and description. Extra Todoist details are kept in the chore description as import notes.

## What Gets Imported

- Task title
- Description
- Due date and time
- Priority
- Project and section context when available
- Labels when Donetick authentication allows label creation
- Subtasks
- Comments and reminders when selected
- Recurrence, deadlines, durations, and Todoist source IDs as notes when Donetick has no matching field

Todoist descriptions are placed at the top of the Donetick description. Import notes are added below them.

## Privacy

The app does not include any Todoist tokens, Donetick server URLs, API keys, passwords, personal tasks, saved settings, or cached snapshots.

Passwords are used only for the current app session and are not saved. Tokens, API keys, settings, and Todoist cache data stay on your Mac.

## More Detail

For field-level mapping details, see [docs/API_MAPPING.md](docs/API_MAPPING.md).
