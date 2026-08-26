"use strict";

const fs = require("fs");
const path = require("path");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  blankComments,
  extractFunction,
  extractAssignedFunction,
  extractInvocation,
} = require("./extract-source.js");

const ROOT = path.join(__dirname, "..");
const BACKGROUND_PATH = path.join(ROOT, "js", "background.js");
const backgroundSrc = fs.readFileSync(BACKGROUND_PATH, "utf8");
const backgroundBlanked = blankComments(backgroundSrc);

const MESSAGE_LISTENERS = [
  "chrome.runtime.onMessage.addListener",
  "chrome.runtime.onMessageExternal.addListener",
];

function listenerInvocation(marker) {
  return extractInvocation(backgroundSrc, backgroundBlanked, marker);
}

function createArea(initial) {
  const store = JSON.parse(JSON.stringify(initial || {}));
  const calls = { get: 0, set: 0, remove: 0 };
  return {
    store: store,
    calls: calls,
    get: function (keys, cb) {
      calls.get++;
      if (typeof keys === "function") {
        cb = keys;
        keys = null;
      }
      const out = {};
      if (keys == null) {
        Object.assign(out, store);
      } else if (typeof keys === "string") {
        if (Object.prototype.hasOwnProperty.call(store, keys)) {
          out[keys] = store[keys];
        }
      } else if (Array.isArray(keys)) {
        for (const key of keys) {
          if (Object.prototype.hasOwnProperty.call(store, key)) {
            out[key] = store[key];
          }
        }
      }
      cb(out);
    },
    set: function (items, cb) {
      calls.set++;
      Object.assign(store, items);
      if (cb) cb();
    },
    remove: function (key, cb) {
      calls.remove++;
      delete store[key];
      if (cb) cb();
    },
  };
}

function loadLoader(opts) {
  opts = opts || {};
  const DEFAULT = opts.defaultConfig || {
    general: { from: "default" },
    version: 1,
  };
  const session = createArea(opts.session);
  const sync = createArea(opts.sync);
  const local = createArea(opts.local);
  const chrome = {
    runtime: { lastError: undefined },
    storage: {},
  };
  if (opts.session !== false) chrome.storage.session = session;
  if (opts.sync !== false) chrome.storage.sync = sync;
  if (opts.local !== false) chrome.storage.local = local;

  let initCount = 0;
  const env = {
    chrome: chrome,
    sub: {
      init: function () {
        initCount++;
      },
    },
    getDefault: {
      value: function () {
        return JSON.parse(JSON.stringify(DEFAULT));
      },
    },
    initialConfig: opts.initialConfig,
  };

  const cacheFn = extractFunction(
    backgroundSrc,
    backgroundBlanked,
    "cacheConfigToSession"
  );
  const loadFn = extractAssignedFunction(
    backgroundSrc,
    backgroundBlanked,
    "loadConfig"
  );

  const api = eval(
    "(function (env) {\n" +
      "var chrome = env.chrome;\n" +
      "var sub = env.sub;\n" +
      "var getDefault = env.getDefault;\n" +
      "var config = env.initialConfig;\n" +
      "var configReady;\n" +
      "var console = { log: function () {}, warn: function () {}, error: function () {} };\n" +
      cacheFn +
      "\n" +
      "var loadConfig = " +
      loadFn +
      ";\n" +
      "return {\n" +
      "  loadConfig: loadConfig,\n" +
      "  getConfig: function () { return config; },\n" +
      "  getConfigReady: function () { return configReady; }\n" +
      "};\n" +
      "})"
  )(env);

  return {
    api: api,
    chrome: chrome,
    session: session,
    sync: sync,
    local: local,
    initCount: function () {
      return initCount;
    },
    DEFAULT: DEFAULT,
  };
}

// This gating is what fixed the first simple-drag-after-idle doing nothing:
// a message that wakes the service worker must wait for config (or start a
// load if none has started) and keep the reply channel open, rather than
// racing the async load.
for (const marker of MESSAGE_LISTENERS) {
  test(marker + " waits on config before dispatching and keeps the channel open", () => {
    const inv = listenerInvocation(marker);
    assert.match(
      inv.blanked,
      /\(\s*configReady\s*\|\|\s*loadConfig\s*\(\s*\)\s*\)\.then\s*\(/,
      "must wait on configReady, or start a load if none has started yet"
    );
    assert.match(
      inv.blanked,
      /sub\.funOnMessage\s*\(\s*message\s*,\s*sender\s*,\s*sendResponse\s*\)/
    );
    assert.match(inv.blanked, /return\s+true/);
  });
}

test("the session cache is dropped when the authoritative store changes, not when session itself writes", () => {
  const inv = extractInvocation(
    backgroundSrc,
    backgroundBlanked,
    "chrome.storage.onChanged.addListener"
  );
  assert.match(inv.blanked, /area\s*===\s*["']sync["']/);
  assert.match(inv.blanked, /area\s*===\s*["']local["']/);
  assert.match(
    inv.blanked,
    /storage\.session\.remove\s*\(\s*["']config["']\s*\)/
  );
  assert.doesNotMatch(inv.blanked, /area\s*===\s*["']session["']/);
});

test("a session-cache hit is adopted when config is not already in memory", async () => {
  const world = loadLoader({
    session: { config: { general: { from: "session" } } },
    sync: { sync: "true", general: { from: "sync" } },
    local: { config: { general: { from: "local" } } },
  });
  await world.api.loadConfig();
  assert.equal(world.api.getConfig().general.from, "session");
  assert.equal(world.sync.calls.get, 0);
  assert.equal(world.local.calls.get, 0);
  assert.equal(world.initCount(), 1);
});

test("a session-cache entry without a general section is rejected", async () => {
  const world = loadLoader({
    session: { config: { mges: {} } },
    sync: { sync: "true", general: { from: "sync" } },
  });
  await world.api.loadConfig();
  assert.equal(world.api.getConfig().general.from, "sync");
  assert.ok(world.sync.calls.get > 0);
});

test("a session-cache miss falls through to the authoritative store", async () => {
  const world = loadLoader({
    session: {},
    sync: { sync: "true", general: { from: "sync" } },
  });
  await world.api.loadConfig();
  assert.equal(world.api.getConfig().general.from, "sync");
  assert.equal(world.session.calls.get, 1);
  assert.ok(world.sync.calls.get > 0);
});

test("an error on the session read falls through to the authoritative store", async () => {
  const world = loadLoader({
    session: { config: { general: { from: "session" } } },
    sync: { sync: "true", general: { from: "sync" } },
  });
  world.session.get = function (keys, cb) {
    world.session.calls.get++;
    world.chrome.runtime.lastError = { message: "session failed" };
    cb({});
    world.chrome.runtime.lastError = undefined;
  };
  await world.api.loadConfig();
  assert.equal(world.api.getConfig().general.from, "sync");
});

test("a browser without session storage loads on the authoritative path without throwing", async () => {
  const world = loadLoader({
    session: false,
    sync: { sync: "true", general: { from: "sync" } },
  });
  await assert.doesNotReject(function () {
    return world.api.loadConfig();
  });
  assert.equal(world.api.getConfig().general.from, "sync");
});

test("a load with config already in memory skips the session cache", async () => {
  const world = loadLoader({
    initialConfig: { general: { from: "memory" } },
    session: { config: { general: { from: "session" } } },
    sync: { sync: "true", general: { from: "sync" } },
  });
  await world.api.loadConfig();
  assert.equal(world.api.getConfig().general.from, "sync");
});

test("a load that names a storage type explicitly skips the session cache", async () => {
  const world = loadLoader({
    session: { config: { general: { from: "session" } } },
    sync: { general: { from: "sync" } },
    local: { config: { general: { from: "local" } } },
  });
  await world.api.loadConfig(false, "sync");
  assert.equal(world.session.calls.get, 0);
  assert.equal(world.api.getConfig().general.from, "sync");

  const localWorld = loadLoader({
    session: { config: { general: { from: "session" } } },
    local: { config: { general: { from: "local" } } },
  });
  await localWorld.api.loadConfig(false, "local");
  assert.equal(localWorld.session.calls.get, 0);
  assert.equal(localWorld.api.getConfig().general.from, "local");
});

test("initialisation runs exactly once whichever path produced the config", async () => {
  const hit = loadLoader({
    session: { config: { general: { from: "session" } } },
  });
  await hit.api.loadConfig();
  assert.equal(hit.initCount(), 1);

  const miss = loadLoader({
    session: {},
    sync: { sync: "true", general: { from: "sync" } },
  });
  await miss.api.loadConfig();
  assert.equal(miss.initCount(), 1);
});

test("the loader returns the config-ready promise, which resolves once config is populated", async () => {
  const world = loadLoader({
    sync: { sync: "true", general: { from: "sync" } },
  });
  const ready = world.api.loadConfig();
  assert.equal(ready, world.api.getConfigReady());
  await ready;
  assert.ok(world.api.getConfig() && world.api.getConfig().general);
});

test("an unset sync preference is recorded as sync-on and then loads from sync storage", async () => {
  const world = loadLoader({
    session: false,
    sync: {},
  });
  await world.api.loadConfig();
  assert.equal(world.sync.store.sync, "true");
  assert.equal(world.api.getConfig().general.from, "default");
});

test("sync-on reads sync storage and sync-off reads local storage", async () => {
  const on = loadLoader({
    session: false,
    sync: { sync: "true", general: { from: "sync" } },
    local: { config: { general: { from: "local" } } },
  });
  await on.api.loadConfig();
  assert.equal(on.api.getConfig().general.from, "sync");

  const off = loadLoader({
    session: false,
    sync: { sync: "false" },
    local: { config: { general: { from: "local" } } },
  });
  await off.api.loadConfig();
  assert.equal(off.api.getConfig().general.from, "local");
});

test("an empty sync store writes defaults and adopts them", async () => {
  const world = loadLoader({
    session: false,
    sync: { sync: "true" },
  });
  await world.api.loadConfig();
  assert.equal(world.api.getConfig().general.from, "default");
  assert.equal(world.sync.store.general.from, "default");
});

test("an empty local store writes defaults under the nested config key and adopts them", async () => {
  const world = loadLoader({
    session: false,
    sync: { sync: "false" },
    local: {},
  });
  await world.api.loadConfig();
  assert.equal(world.api.getConfig().general.from, "default");
  assert.equal(world.local.store.config.general.from, "default");
});

test("the old flat local-storage layout is still read as config", async () => {
  const world = loadLoader({
    session: false,
    sync: { sync: "false" },
    local: { version: 40, general: { from: "flat" } },
  });
  await world.api.loadConfig();
  assert.equal(world.api.getConfig().version, 40);
  assert.equal(world.api.getConfig().general.from, "flat");
});

test("a browser without sync storage records the preference as off and uses local storage", async () => {
  const world = loadLoader({
    session: false,
    sync: false,
    local: { config: { general: { from: "local" } } },
  });
  await world.api.loadConfig();
  assert.equal(world.local.store.sync, "false");
  assert.equal(world.api.getConfig().general.from, "local");
});

test("config is written to the session cache after a successful load", async () => {
  const world = loadLoader({
    session: {},
    sync: { sync: "true", general: { from: "sync" } },
  });
  await world.api.loadConfig();
  assert.equal(world.session.store.config.general.from, "sync");
});

test("a browser without session storage swallows the cache write", async () => {
  const world = loadLoader({
    session: false,
    sync: { sync: "true", general: { from: "sync" } },
  });
  await assert.doesNotReject(function () {
    return world.api.loadConfig();
  });
  assert.equal(world.api.getConfig().general.from, "sync");
});
