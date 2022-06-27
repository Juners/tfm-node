import path, { join, dirname } from "path";
import { Low, JSONFile } from "lowdb";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use JSON file for storage
const file = join(__dirname, "db.json");
const adapter = new JSONFile(file);
const db = new Low(adapter);

const INITIAL_DATA = {
  generation: 1,
  users: ["javier", "ivan", "alex", "adrian", "marc", "sergi"],
  boards: {
    Javier: {},
    Ivan: {},
    Alex: {},
    Adrian: {},
    Marc: {},
    Sergi: {},
  },
};

export async function initializeDb() {
  console.log("\x1b[33m%s\x1b[0m", "Initializing database...");
  await db.read();

  db.data ||= INITIAL_DATA;

  await db.write();

  console.log("\x1b[32m%s\x1b[0m", "Database initialized...\n");
}

export async function readDb(...paths) {
  await db.read();

  let data = db.data;
  paths.forEach((path) => {
    data = data[path];
  });

  return data;
}

export async function writeDb(data, topLevelPath) {
  if (topLevelPath) {
    db.data[topLevelPath] = data;
  } else {
    db.data = data;
  }

  await db.write();
  return data;
}

export async function createBoard(owner, data) {
  const { boards } = db.data;
  if (boards[owner]) return false;

  boards[owner] = data;

  await db.write();

  return true;
}


export async function updateBoard(owner, data) {
  const { boards } = db.data;
  if (!boards[owner]) return false;

  boards[owner] = data;

  await db.write();

  return true;
}
