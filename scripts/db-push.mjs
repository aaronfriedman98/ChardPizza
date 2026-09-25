// Applies supabase/migrations to the remote database using DATABASE_URL from .env.local.
// Uses --db-url so no Supabase login or project link is required.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const url = env.DATABASE_URL;
if (!url || url.startsWith("paste-")) {
  console.error("DATABASE_URL is not set in .env.local");
  process.exit(1);
}
const args = ["supabase", "db", "push", "--db-url", url, ...process.argv.slice(2)];
const r = spawnSync("npx", args, { stdio: "inherit", shell: true });
process.exit(r.status ?? 1);
