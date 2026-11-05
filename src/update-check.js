// Update check: tell the user once when this install is behind the published gentle-decks.
// See odd/tasks/update-check.md (S1, S2) and docs/cli.md, "Update check".
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolved like bin/decks.js locates its files: the package root next to this module.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const REGISTRY_URL = "https://registry.npmjs.org/gentle-decks/latest";
export const STATE_FILE = "update-check.json";
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Long enough for a slow registry, short enough to stay invisible: one lookup a day.
export const FETCH_TIMEOUT_MS = 2500;

// `0.2.1`, `v0.2.1` and `0.2.1-beta.1` all compare as [0, 2, 1]; prereleases of a published
// version are not behind it, and a bare git install (`0.0.0`) is.
function versionParts(value) {
  if (typeof value !== "string") return null;
  const match = /^\s*v?(\d+(?:\.\d+)*)/.exec(value);
  return match ? match[1].split(".").map(Number) : null;
}

export function isOutdated(installed, latest) {
  const a = versionParts(installed);
  const b = versionParts(latest);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const mine = a[i] || 0;
    const theirs = b[i] || 0;
    if (mine !== theirs) return mine < theirs;
  }
  return false;
}

// The state lives in the gentle-decks config directory, the same base src/theme.js uses for
// the user themes dir. GENTLE_DECKS_THEMES relocates both, so tests point it at a temp dir.
export function configDir(env = process.env) {
  if (env.GENTLE_DECKS_THEMES) return path.resolve(env.GENTLE_DECKS_THEMES);
  const config = env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(config, "gentle-decks");
}

export function installedVersion(root = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
}

function readState(file) {
  try {
    const state = JSON.parse(fs.readFileSync(file, "utf8"));
    return state && typeof state === "object" && !Array.isArray(state) ? state : null;
  } catch {
    return null;
  }
}

// Best effort: an unwritable config directory must never surface in the CLI.
function writeState(file, state) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
  } catch {}
}

// The published version, or null for any network, HTTP or JSON problem; the caller stays silent.
async function latestFromRegistry(fetchImpl, timeoutMs) {
  try {
    const response = await fetchImpl(REGISTRY_URL, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const version = (await response.json())?.version;
    return versionParts(version) ? version : null;
  } catch {
    return null;
  }
}

// Returns the one-line warning to print, or null when there is nothing to say. Never throws.
// Every input is injectable (env, fetch, clock, version, state dir) so tests stay offline.
export async function checkForUpdate(options = {}) {
  const {
    env = process.env,
    fetch: fetchImpl = globalThis.fetch,
    now = Date.now(),
    version,
    dir = configDir(env),
    timeoutMs = FETCH_TIMEOUT_MS,
  } = options;
  if (env.GENTLE_DECKS_NO_UPDATE_CHECK) return null;

  const installed = version ?? installedVersion();
  if (!versionParts(installed)) return null;

  const file = path.join(dir, STATE_FILE);
  let state = readState(file) ?? {};
  let latest = versionParts(state.latest) ? state.latest : null;
  let checkedAt = Number.isFinite(state.checkedAt) ? state.checkedAt : null;
  if (checkedAt === null || now - checkedAt >= CHECK_INTERVAL_MS) {
    const fetched = await latestFromRegistry(fetchImpl, timeoutMs);
    if (fetched) latest = fetched;
    // A failed lookup also counts as today's attempt: an offline install must not wait for
    // the timeout on every command.
    state = { ...state, checkedAt: now };
    if (latest) state.latest = latest;
    writeState(file, state);
    checkedAt = now;
  }

  if (!latest || !isOutdated(installed, latest)) return null;
  // Warn once per (installed, latest) pair: a new install or release re-arms the warning.
  const pair = `${installed}|${latest}`;
  if (state.warnedFor === pair) return null;
  writeState(file, { ...state, checkedAt, latest, warnedFor: pair });
  return `gentle-decks ${installed} is not the latest published version (${latest}); run \`npm i -g gentle-decks\` to update.\n`;
}
