const fs = require("node:fs/promises");
const path = require("node:path");

const DB_PATH = path.join(__dirname, "..", "..", "data", "weekly-reports.json");

async function ensureStore() {
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
    await fs.writeFile(DB_PATH, JSON.stringify({ weeks: [] }, null, 2), "utf8");
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(DB_PATH, "utf8");
  return JSON.parse(raw);
}

async function writeStore(data) {
  await ensureStore();
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

module.exports = {
  readStore,
  writeStore,
};
