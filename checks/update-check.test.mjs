// Update check. Run: node --test checks/update-check.test.mjs
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CHECK_INTERVAL_MS,
  REGISTRY_URL,
  STATE_FILE,
  checkForUpdate,
  configDir,
  installedVersion,
  isOutdated,
} from "../src/update-check.js";

const CLI = path.resolve("bin/decks.js");
const scratch = [];
const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "decks-update-"));
  scratch.push(dir);
  return dir;
};
after(() => {
  for (const dir of scratch) fs.rmSync(dir, { recursive: true, force: true });
});

const WARNING = "gentle-decks 0.2.1 is not the latest published version (0.3.0); run `npm i -g gentle-decks` to update.\n";
const stateFile = (dir) => path.join(dir, STATE_FILE);
const readState = (dir) => JSON.parse(fs.readFileSync(stateFile(dir), "utf8"));

// The registry is never reached: every call goes through an injected fetch that counts uses.
function registry(version, calls = { count: 0 }) {
  calls.fetch = async (url) => {
    calls.count += 1;
    calls.url = url;
    return { ok: true, json: async () => ({ version }) };
  };
  return calls;
}

test("warns once and then stays silent for the same outdated pair", async () => {
  const dir = tmp();
  const calls = registry("0.3.0");
  const options = { env: {}, dir, fetch: calls.fetch, version: "0.2.1" };

  assert.equal(await checkForUpdate({ ...options, now: 1 }), WARNING);
  assert.deepEqual(readState(dir), { checkedAt: 1, latest: "0.3.0", warnedFor: "0.2.1|0.3.0" });

  assert.equal(await checkForUpdate({ ...options, now: 2 }), null);
  assert.equal(calls.count, 1, "the cached latest serves the second comparison");
  assert.deepEqual(readState(dir), { checkedAt: 1, latest: "0.3.0", warnedFor: "0.2.1|0.3.0" });
});

test("warns again for a new outdated pair", async () => {
  const dir = tmp();
  const first = registry("0.3.0");
  await checkForUpdate({ env: {}, dir, fetch: first.fetch, version: "0.2.1", now: 1 });

  const next = registry("0.4.0");
  const wentBy = 1 + CHECK_INTERVAL_MS;
  assert.equal(
    await checkForUpdate({ env: {}, dir, fetch: next.fetch, version: "0.2.1", now: wentBy }),
    "gentle-decks 0.2.1 is not the latest published version (0.4.0); run `npm i -g gentle-decks` to update.\n",
  );
  assert.equal(next.count, 1);
  assert.deepEqual(readState(dir), { checkedAt: wentBy, latest: "0.4.0", warnedFor: "0.2.1|0.4.0" });
});

test("re-checks the registry at most once a day", async () => {
  const dir = tmp();
  const calls = registry("0.3.0");
  const options = { env: {}, dir, fetch: calls.fetch, version: "0.2.1" };

  await checkForUpdate({ ...options, now: 1000 });
  await checkForUpdate({ ...options, now: 1000 + CHECK_INTERVAL_MS - 1 });
  assert.equal(calls.count, 1, "a fresh cache is not re-fetched");

  await checkForUpdate({ ...options, now: 1000 + CHECK_INTERVAL_MS });
  assert.equal(calls.count, 2, "a stale cache is re-fetched");
});

test("is silent when the installed version is not behind", async () => {
  const dir = tmp();
  const upToDate = registry("0.2.1");
  assert.equal(await checkForUpdate({ env: {}, dir, fetch: upToDate.fetch, version: "0.2.1", now: 1 }), null);
  assert.equal(upToDate.url, REGISTRY_URL);
  assert.equal(readState(dir).warnedFor, undefined);

  const ahead = registry("0.9.0");
  assert.equal(await checkForUpdate({ env: {}, dir, fetch: ahead.fetch, version: "0.10.0", now: 1 + CHECK_INTERVAL_MS }), null);
  assert.equal(ahead.count, 1, "the newer install still checked the registry");
  assert.equal(readState(dir).warnedFor, undefined);
});

test("compares versions numerically, not as strings", () => {
  assert.equal(isOutdated("0.2.1", "0.10.0"), true);
  assert.equal(isOutdated("0.10.0", "0.9.0"), false);
  assert.equal(isOutdated("0.2.1", "0.2.1"), false);
  assert.equal(isOutdated("0.2.1-beta.1", "0.2.1"), false);
  assert.equal(isOutdated("v0.2.1", "0.3.0"), true);
  assert.equal(isOutdated("", "0.3.0"), false);
  assert.equal(isOutdated("0.2.1", ""), false);
});

test("is silent when the registry cannot be reached", async () => {
  const dir = tmp();
  let calls = 0;
  const offline = async () => {
    calls += 1;
    throw new Error("getaddrinfo ENOTFOUND registry.npmjs.org");
  };
  const options = { env: {}, dir, fetch: offline, version: "0.2.1" };

  assert.equal(await checkForUpdate({ ...options, now: 1 }), null);
  assert.equal(readState(dir).latest, undefined, "no version is cached from a failed lookup");
  assert.equal(await checkForUpdate({ ...options, now: 2 }), null);
  assert.equal(calls, 1, "a failed lookup is not retried on every invocation");
});

test("is silent on a malformed registry answer", async () => {
  const answers = [
    async () => ({ ok: false, json: async () => ({}) }),
    async () => ({ ok: true, json: async () => ({ name: "gentle-decks" }) }),
    async () => ({ ok: true, json: async () => { throw new Error("bad json"); } }),
    async () => ({ ok: true, json: async () => ({ version: "not-a-version" }) }),
  ];
  for (const fetch of answers) {
    const dir = tmp();
    assert.equal(await checkForUpdate({ env: {}, dir, fetch, version: "0.2.1", now: 1 }), null);
    assert.equal(readState(dir).latest, undefined);
  }
});

test("GENTLE_DECKS_NO_UPDATE_CHECK opts out entirely", async () => {
  for (const value of ["1", "0", "yes"]) {
    const dir = tmp();
    const calls = registry("9.9.9");
    assert.equal(
      await checkForUpdate({ env: { GENTLE_DECKS_NO_UPDATE_CHECK: value }, dir, fetch: calls.fetch, version: "0.2.1", now: 1 }),
      null,
    );
    assert.equal(calls.count, 0, "the opt-out skips the network");
    assert.equal(fs.existsSync(stateFile(dir)), false, "the opt-out writes nothing");
  }
});

test("the state file lives in the gentle-decks config directory", () => {
  assert.equal(configDir({ XDG_CONFIG_HOME: "/x" }), path.join("/x", "gentle-decks"));
  assert.equal(configDir({ GENTLE_DECKS_THEMES: "/t/themes" }), path.resolve("/t/themes"));
  assert.equal(configDir({}), path.join(os.homedir(), ".config", "gentle-decks"));

  const dir = tmp();
  assert.equal(stateFile(dir), path.join(dir, "update-check.json"));
});

test("the installed version is read from package.json", () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
  assert.equal(installedVersion(), pkg.version);
});

test("a pending warning never reaches piped CLI output", () => {
  // A fresh cache naming a newer version would warn if the check ran for a non-interactive
  // caller; scripts and tests keep reading only the command's own output.
  const dir = tmp();
  fs.writeFileSync(stateFile(dir), JSON.stringify({ checkedAt: Date.now(), latest: "99.0.0" }));
  const r = spawnSync(process.execPath, [CLI, "theme", "check", "gentleman-cute"], {
    encoding: "utf8",
    env: { ...process.env, GENTLE_DECKS_THEMES: dir },
    timeout: 60000,
  });
  assert.deepEqual({ code: r.status, stdout: r.stdout, stderr: r.stderr }, {
    code: 0, stdout: "ok: gentleman-cute\n", stderr: "",
  });
  assert.equal(readState(dir).warnedFor, undefined, "the piped run records nothing")
});
