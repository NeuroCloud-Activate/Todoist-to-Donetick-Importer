const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_IMPORT_OPTIONS = {
  includeComments: true,
  includeReminders: true,
  createProjects: true,
  createLabels: true,
  subtasksAsDonetick: true,
  skipDuplicates: true,
  defaultDueTime: "09:00",
  donetickMode: "auto",
  syncTodoistBeforePreview: true,
  forceFullTodoistSync: false
};

const DEFAULT_SETTINGS = {
  todoistApiBase: "https://api.todoist.com/api/v1",
  todoistToken: "",
  donetickBaseUrl: "",
  donetickUsername: "",
  donetickPassword: "",
  donetickAuthToken: "",
  donetickApiKey: "",
  importOptions: DEFAULT_IMPORT_OPTIONS
};

function stripTransientSecrets(settings = {}) {
  const next = { ...settings };
  delete next.donetickPassword;
  return next;
}

function mergeSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    importOptions: {
      ...DEFAULT_IMPORT_OPTIONS,
      ...(settings.importOptions || {})
    }
  };
}

function createSettingsStore(userDataPath) {
  const settingsFile = path.join(userDataPath, "settings.json");

  async function load() {
    try {
      const raw = await fs.readFile(settingsFile, "utf8");
      return mergeSettings(JSON.parse(raw));
    } catch (error) {
      if (error.code === "ENOENT") {
        return mergeSettings();
      }
      throw error;
    }
  }

  async function save(settings) {
    const next = mergeSettings(stripTransientSecrets(settings));
    await fs.mkdir(path.dirname(settingsFile), { recursive: true });
    await fs.writeFile(settingsFile, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return next;
  }

  async function clear() {
    try {
      await fs.unlink(settingsFile);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    return mergeSettings();
  }

  return { load, save, clear };
}

module.exports = {
  DEFAULT_IMPORT_OPTIONS,
  DEFAULT_SETTINGS,
  createSettingsStore,
  mergeSettings,
  stripTransientSecrets
};
