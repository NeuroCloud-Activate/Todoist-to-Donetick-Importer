# Todoist to Donetick Importer

A lightweight Electron app for previewing active Todoist tasks and importing them into Donetick.

FYI: This project was built collaboratively using AI through OpenAI Codex.

## Features

- Fetches Todoist active tasks, projects, sections, labels, comments, and reminders.
- Uses Todoist Sync API snapshots to minimize API calls: one full sync initially, incremental sync afterward, and cached snapshot reuse during import.
- Previews the translation before writing to Donetick, with editable Donetick name, due date, priority, and description fields.
- Imports through Donetick's full `/api/v1/chores/` API when available.
- Falls back to Donetick's simple `/eapi/v1/chore` API for basic imports.
- Preserves Todoist metadata that Donetick cannot represent directly inside the Donetick chore description.
- Keeps Todoist tokens, Donetick server URLs, and Donetick API keys configurable at runtime. No private values are included in this repository.

## Setup

```sh
npm install
npm start
```

## Portable macOS App

Build a standalone `.app` bundle:

```sh
npm run package:mac
```

The output is:

- `dist/mac/Todoist Donetick Importer.app`
- `dist/mac/Todoist Donetick Importer Data/`

For portability, keep the data folder next to the `.app`. The packaged app stores saved settings and Todoist snapshot cache in that sibling data folder instead of macOS Application Support. Do not publish the data folder after entering real Todoist or Donetick credentials.

Run tests:

```sh
npm test
```

Create a GitHub release-ready macOS zip:

```sh
npm run package:mac:release
```

The release zip is written to `dist/release/` and contains the `.app` bundle only. Do not upload the sibling portable data folder if you have entered real credentials or synced real Todoist data.

## Runtime Configuration

In the app, enter:

- Todoist API token
- Donetick server URL
- Donetick username/password or existing JWT token for preferred Full API authentication
- Donetick API key as a fallback, and for Simple external API mode
- Import mode: Auto, Full API only, or Simple external API fallback

The app stores saved settings in Electron's user data folder for the local user. Donetick passwords are used only for the current app session and are not saved. Saved Todoist tokens, Donetick JWT tokens, and Donetick API keys are local secrets. Do not commit exported settings or local fixture data.

The Todoist snapshot cache is also stored in Electron's user data folder. Use **Clear Cache** in the app if you need to force a clean Todoist sync. Use **Force full Todoist sync next preview** when an incremental sync token is stale or you want to rebuild the local snapshot.

Donetick imports prefer Full API calls. In Auto mode, the app tries the Full API with JWT authentication first. JWT can come from username/password login or from a pasted existing JWT token. If JWT is unavailable or rejected, the app retries the Full API with the Donetick API key, and only falls back to the Simple external API if the Full API is unavailable. Some Donetick deployments accept API keys for chores and projects but not for labels, so JWT authentication is required for native Donetick label creation on those servers. If label setup is rejected, the importer continues without native label assignment, preserves Todoist label data in chore descriptions, and reports a setup warning in the results panel.

## How Import Works

1. Enter the Todoist API token and Donetick connection details.
2. Click **Preview Todoist Tasks** to build a local Todoist snapshot and translated Donetick preview.
3. Edit the Donetick name, due date, priority, or description directly in the preview table.
4. Select the rows to import.
5. Click **Import Selected** to create Donetick chores from the reviewed preview.

Todoist descriptions are placed at the top of the generated Donetick description. Todoist fields without a direct Donetick equivalent, such as comments, reminders, deadlines, durations, labels, source IDs, and unsupported recurrence text, are preserved in the same description as structured import notes.

## Privacy Notes

The repository does not include Todoist tokens, Donetick server URLs, Donetick API keys, personal task data, saved settings, or cached snapshots. Runtime settings and Todoist cache data live in the local Electron user-data folder or, for packaged portable builds, in the sibling `Todoist Donetick Importer Data/` folder.

## API References

- Todoist API v1: https://developer.todoist.com/api/v1/
- Donetick API docs: https://docs.donetick.com/advance-settings/api/
- Donetick source routes: https://github.com/donetick/donetick

## Mapping Strategy

See [`docs/API_MAPPING.md`](docs/API_MAPPING.md) for field-level behavior and limitations.
