const fs = require("node:fs/promises");
const path = require("node:path");

const CACHE_VERSION = 1;

function createSnapshotStore(userDataPath) {
  const cacheFile = path.join(userDataPath, "todoist-snapshot-cache.json");

  async function load() {
    try {
      const raw = await fs.readFile(cacheFile, "utf8");
      const payload = JSON.parse(raw);
      if (payload.version !== CACHE_VERSION || !payload.snapshot) {
        return null;
      }
      return payload.snapshot;
    } catch (error) {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async function save(snapshot) {
    const payload = {
      version: CACHE_VERSION,
      savedAt: new Date().toISOString(),
      snapshot
    };
    await fs.mkdir(path.dirname(cacheFile), { recursive: true });
    await fs.writeFile(cacheFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    return snapshot;
  }

  async function clear() {
    try {
      await fs.unlink(cacheFile);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    return null;
  }

  return { load, save, clear };
}

module.exports = {
  CACHE_VERSION,
  createSnapshotStore
};
