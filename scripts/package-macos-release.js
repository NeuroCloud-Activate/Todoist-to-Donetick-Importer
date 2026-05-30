const fs = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const packageMac = require.resolve("./package-macos-app");

const ROOT = path.resolve(__dirname, "..");
const APP_NAME = "Todoist Donetick Importer";
const PACKAGE_JSON = require(path.join(ROOT, "package.json"));
const DIST_DIR = path.join(ROOT, "dist");
const MAC_DIR = path.join(DIST_DIR, "mac");
const RELEASE_DIR = path.join(DIST_DIR, "release");
const APP_PATH = path.join(MAC_DIR, `${APP_NAME}.app`);
const ZIP_PATH = path.join(RELEASE_DIR, `Todoist-Donetick-Importer-${PACKAGE_JSON.version}-mac.zip`);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "pipe"
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
  return result;
}

async function main() {
  run(process.execPath, [packageMac]);
  await fs.mkdir(RELEASE_DIR, { recursive: true });
  await fs.rm(ZIP_PATH, { force: true });
  run("ditto", ["-c", "-k", "--keepParent", APP_PATH, ZIP_PATH]);
  console.log(`Built ${ZIP_PATH}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
