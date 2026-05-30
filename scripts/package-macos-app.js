const fs = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const APP_NAME = "Todoist Donetick Importer";
const APP_IDENTIFIER = "com.todoistdonetick.importer";
const ELECTRON_APP = path.join(ROOT, "node_modules", "electron", "dist", "Electron.app");
const DIST_DIR = path.join(ROOT, "dist", "mac");
const OUTPUT_APP = path.join(DIST_DIR, `${APP_NAME}.app`);
const RESOURCES_DIR = path.join(OUTPUT_APP, "Contents", "Resources");
const EMBEDDED_APP_DIR = path.join(RESOURCES_DIR, "app");
const DATA_DIR = path.join(DIST_DIR, `${APP_NAME} Data`);

const APP_FILES = [
  "package.json",
  "package-lock.json",
  "README.md",
  "docs",
  "src"
];

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

async function copyRequiredAppFiles() {
  await fs.mkdir(EMBEDDED_APP_DIR, { recursive: true });
  for (const relativePath of APP_FILES) {
    const source = path.join(ROOT, relativePath);
    if (!(await exists(source))) {
      continue;
    }
    await fs.cp(source, path.join(EMBEDDED_APP_DIR, relativePath), {
      recursive: true,
      filter: (sourcePath) => {
        const basename = path.basename(sourcePath);
        return basename !== "node_modules" && basename !== "dist";
      }
    });
  }
}

async function patchInfoPlist() {
  const plist = path.join(OUTPUT_APP, "Contents", "Info.plist");
  const updates = [
    ["CFBundleDisplayName", APP_NAME],
    ["CFBundleName", APP_NAME],
    ["CFBundleIdentifier", APP_IDENTIFIER],
    ["LSApplicationCategoryType", "public.app-category.productivity"]
  ];

  for (const [key, value] of updates) {
    run("plutil", ["-replace", key, "-string", value, plist]);
  }

  run("plutil", ["-remove", "ElectronAsarIntegrity", plist], { allowFailure: true });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8"
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
  return result;
}

async function main() {
  if (!(await exists(ELECTRON_APP))) {
    throw new Error("Electron is not installed. Run npm install first.");
  }

  await fs.mkdir(DIST_DIR, { recursive: true });
  await fs.rm(OUTPUT_APP, { recursive: true, force: true });
  await fs.cp(ELECTRON_APP, OUTPUT_APP, {
    recursive: true,
    verbatimSymlinks: true
  });
  await fs.rm(path.join(RESOURCES_DIR, "default_app.asar"), { force: true });
  await copyRequiredAppFiles();
  await patchInfoPlist();
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(
    path.join(DATA_DIR, "README.txt"),
    [
      `${APP_NAME} portable data folder`,
      "",
      "The packaged macOS app stores saved settings and Todoist snapshot cache here.",
      "Keep this folder next to the .app when moving the app between Macs.",
      "Do not publish this folder if it contains real API keys, tokens, or cached personal task data.",
      ""
    ].join("\n"),
    "utf8"
  );

  console.log(`Built ${OUTPUT_APP}`);
  console.log(`Portable data folder: ${DATA_DIR}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
