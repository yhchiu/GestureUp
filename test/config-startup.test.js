"use strict";

const fs = require("fs");
const path = require("path");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  blankComments,
  extractFunction,
  objectLiteral,
} = require("./extract-source.js");

const ROOT = path.join(__dirname, "..");
const EVENT_PATH = path.join(ROOT, "js", "event.js");
const eventSrc = fs.readFileSync(EVENT_PATH, "utf8");
const eventBlanked = blankComments(eventSrc);

// The backup was stored under this key before the project was renamed from
// SmartUp. Renaming it would orphan the backup of every existing install.
const PAGE_STORAGE_BACKUP_KEY = "smartup_backup_config";

const STARTUP_FNS = [
  "checkExtensionContext",
  "loadConfigWithRetry",
  "handleConfigLoadError",
  "tryFallbackConfig",
  "showExtensionRecoveryNotification",
  "showExtensionContextNotification",
  "backupConfigToLocal",
  "scheduleConfigReload",
];

const watchedConfigChanged = eval(
  "(" + extractFunction(eventSrc, eventBlanked, "watchedConfigChanged") + ")"
);

function createFakeClock() {
  let nextId = 1;
  let now = 0;
  const timers = new Map();

  function setTimeout(fn, delay) {
    const id = nextId++;
    const wait = Number(delay) || 0;
    timers.set(id, { fn: fn, at: now + wait, delay: wait });
    return id;
  }

  function clearTimeout(id) {
    timers.delete(id);
  }

  function pending() {
    return [...timers.entries()]
      .map(([id, t]) => ({ id: id, fn: t.fn, at: t.at, delay: t.delay }))
      .sort((a, b) => a.at - b.at);
  }

  function runNext() {
    const list = pending();
    if (list.length === 0) throw new Error("no timers to run");
    const t = list[0];
    timers.delete(t.id);
    now = t.at;
    t.fn();
    return t;
  }

  function advance(ms) {
    const target = now + ms;
    while (pending().length && pending()[0].at <= target) {
      runNext();
    }
    now = target;
  }

  return {
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    pending: pending,
    runNext: runNext,
    advance: advance,
    now: function () {
      return now;
    },
  };
}

function createPageStorage(initial, opts) {
  const map = new Map(Object.entries(initial || {}));
  opts = opts || {};
  return {
    getItem: function (key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem: function (key, value) {
      if (opts.throwOnSet) throw opts.throwOnSet;
      map.set(key, String(value));
    },
    removeItem: function (key) {
      map.delete(key);
    },
  };
}

function createDocument() {
  const banners = [];
  function element() {
    return {
      style: {},
      innerHTML: "",
      id: "",
      textContent: "",
      parentNode: { removeChild: function () {} },
      querySelector: function () {
        return { addEventListener: function () {}, style: {} };
      },
      addEventListener: function () {},
    };
  }
  return {
    banners: banners,
    createElement: function () {
      return element();
    },
    getElementById: function () {
      return null;
    },
    head: { appendChild: function () {} },
    body: {
      appendChild: function (node) {
        banners.push(node);
      },
    },
  };
}

function createMessaging(chrome) {
  const calls = [];
  const waiting = [];
  return {
    calls: calls,
    sendMessage: function (id, message, callback) {
      calls.push({ id: id, message: message });
      waiting.push(callback);
    },
    reply: function (response, lastError) {
      const cbs = waiting.splice(0, waiting.length);
      for (const cb of cbs) {
        chrome.runtime.lastError = lastError || undefined;
        cb(response);
        chrome.runtime.lastError = undefined;
      }
    },
  };
}

function loadStartup(opts) {
  opts = opts || {};
  const clock = createFakeClock();
  const document = createDocument();
  const localStorage = createPageStorage(opts.pageStorage, opts.pageStorageOpts);
  const configLoadState = Object.assign(
    eval(
      "(" + objectLiteral(eventSrc, eventBlanked, "var configLoadState =") + ")"
    ),
    opts.configLoadState || {}
  );
  const chrome = {
    runtime: {
      id: "test-extension-id",
      lastError: undefined,
    },
  };
  const messaging = createMessaging(chrome);
  chrome.runtime.sendMessage = messaging.sendMessage;

  const inits = [];
  const sue = {
    cons: { os: "win" },
    init: function () {
      inits.push(true);
    },
  };

  const env = {
    configLoadState: configLoadState,
    extensionContextValid: opts.extensionContextValid !== false,
    extensionContextNotificationShown: false,
    topLevelExclusionURL: "",
    config: opts.config !== undefined ? opts.config : {},
    devMode: undefined,
    extID: chrome.runtime.id,
    chrome: chrome,
    sue: sue,
    localStorage: localStorage,
    document: document,
    window: {
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
    },
    setTimeout: clock.setTimeout,
    Math: {
      floor: Math.floor,
      random: opts.random || function () {
        return 0;
      },
    },
    cachedI18nStrings: {
      extensionUpdated: "updated",
      extensionUpdatedDesc: "desc",
      reload: "reload",
    },
  };

  const extracted = STARTUP_FNS.map(function (name) {
    return extractFunction(eventSrc, eventBlanked, name);
  }).join("\n");

  const api = eval(
    "(function (env) {\n" +
      "var configLoadState = env.configLoadState;\n" +
      "var extensionContextValid = env.extensionContextValid;\n" +
      "var extensionContextNotificationShown = env.extensionContextNotificationShown;\n" +
      "var topLevelExclusionURL = env.topLevelExclusionURL;\n" +
      "var config = env.config;\n" +
      "var devMode = env.devMode;\n" +
      "var extID = env.extID;\n" +
      "var chrome = env.chrome;\n" +
      "var sue = env.sue;\n" +
      "var localStorage = env.localStorage;\n" +
      "var document = env.document;\n" +
      "var window = env.window;\n" +
      "var setTimeout = env.setTimeout;\n" +
      "var Math = env.Math;\n" +
      "var cachedI18nStrings = env.cachedI18nStrings;\n" +
      "var console = { log: function () {}, warn: function () {}, error: function () {} };\n" +
      extracted +
      "\nreturn {\n" +
      "  loadConfigWithRetry: loadConfigWithRetry,\n" +
      "  handleConfigLoadError: handleConfigLoadError,\n" +
      "  tryFallbackConfig: tryFallbackConfig,\n" +
      "  backupConfigToLocal: backupConfigToLocal,\n" +
      "  scheduleConfigReload: scheduleConfigReload,\n" +
      "  getConfig: function () { return config; },\n" +
      "  getDevMode: function () { return devMode; },\n" +
      "  getTopLevelExclusionURL: function () { return topLevelExclusionURL; },\n" +
      "  getExtensionContextValid: function () { return extensionContextValid; }\n" +
      "};\n" +
      "})"
  )(env);

  return {
    api: api,
    clock: clock,
    messaging: messaging,
    document: document,
    localStorage: localStorage,
    configLoadState: configLoadState,
    sue: sue,
    inits: inits,
  };
}

function validResponse() {
  return {
    config: {
      general: {
        fnswitch: { fnmges: true },
        settings: { timeoutvalue: 2000 },
        exclusion: { exclusion: false },
      },
    },
    tabURL: "https://example.com/path",
    devMode: true,
    os: "linux",
  };
}

function failUntilFallback(world) {
  world.api.loadConfigWithRetry();
  const max = world.configLoadState.maxRetries;
  for (let i = 0; i <= max; i++) {
    assert.equal(world.messaging.calls.length, i + 1);
    world.messaging.reply({});
    if (i < max) world.clock.runNext();
  }
}

test("a load already in flight does not start a second one", () => {
  const world = loadStartup();
  world.api.loadConfigWithRetry();
  world.api.loadConfigWithRetry();
  assert.equal(world.messaging.calls.length, 1);
  assert.deepEqual(world.messaging.calls[0].message, { type: "evt_getconf" });
});

test("a load is not attempted when the extension context is already invalid", () => {
  const world = loadStartup({ extensionContextValid: false });
  world.api.loadConfigWithRetry();
  assert.equal(world.messaging.calls.length, 0);
});

test("a successful response populates config, exclusion URL, developer mode, and OS", () => {
  const world = loadStartup();
  world.api.loadConfigWithRetry();
  world.messaging.reply(validResponse());
  assert.equal(world.api.getConfig().general.fnswitch.fnmges, true);
  assert.equal(world.api.getTopLevelExclusionURL(), "https://example.com/path");
  assert.equal(world.api.getDevMode(), true);
  assert.equal(world.sue.cons.os, "linux");
});

test("a successful load resets the retry count, marks startup initialised, and starts listeners", () => {
  const world = loadStartup({ configLoadState: { retryCount: 2 } });
  world.api.loadConfigWithRetry();
  world.messaging.reply(validResponse());
  assert.equal(world.configLoadState.retryCount, 0);
  assert.equal(world.configLoadState.isInitialized, true);
  assert.equal(world.inits.length, 1);
});

test("a response missing config is treated as a failure", () => {
  const world = loadStartup();
  world.api.loadConfigWithRetry();
  world.messaging.reply({ tabURL: "https://example.com/" });
  assert.equal(world.configLoadState.retryCount, 1);
  assert.equal(world.configLoadState.isInitialized, false);
  assert.equal(world.inits.length, 0);
  assert.equal(world.clock.pending().length, 1);
});

test("a response missing the general section is treated as a failure", () => {
  const world = loadStartup();
  world.api.loadConfigWithRetry();
  world.messaging.reply({ config: { mges: {} } });
  assert.equal(world.configLoadState.retryCount, 1);
  assert.equal(world.configLoadState.isInitialized, false);
  assert.equal(world.inits.length, 0);
  assert.equal(world.api.getConfig().mges, undefined);
  assert.equal(world.clock.pending().length, 1);
});

test("a runtime error on the config message is treated as a failure", () => {
  const world = loadStartup();
  world.api.loadConfigWithRetry();
  world.messaging.reply(null, { message: "Could not establish connection" });
  assert.equal(world.configLoadState.retryCount, 1);
  assert.equal(world.inits.length, 0);
  assert.equal(world.clock.pending().length, 1);
});

test("an invalidated-context error stops retrying, marks the context invalid, and notifies once", () => {
  const world = loadStartup();
  world.api.loadConfigWithRetry();
  world.messaging.reply(null, { message: "Extension context invalidated" });
  assert.equal(world.api.getExtensionContextValid(), false);
  assert.equal(world.document.banners.length, 1);
  assert.equal(world.inits.length, 0);
  world.clock.advance(3000);
  assert.equal(world.messaging.calls.length, 1);
  world.api.loadConfigWithRetry();
  assert.equal(world.messaging.calls.length, 1);
  assert.equal(world.document.banners.length, 1);
});

test("a retryable failure increments the retry count and schedules another attempt", () => {
  const world = loadStartup();
  world.api.loadConfigWithRetry();
  world.messaging.reply({});
  assert.equal(world.configLoadState.retryCount, 1);
  assert.equal(world.clock.pending().length, 1);
  world.clock.runNext();
  assert.equal(world.messaging.calls.length, 2);
});

test("each retry waits longer than the last, in proportion to the retry number", () => {
  const world = loadStartup();
  world.api.loadConfigWithRetry();
  const delays = [];
  const max = world.configLoadState.maxRetries;
  for (let i = 0; i < max; i++) {
    world.messaging.reply({});
    const next = world.clock.pending()[0];
    delays.push(next.delay);
    assert.equal(next.delay, world.configLoadState.retryDelay * (i + 1));
    world.clock.runNext();
  }
  assert.deepEqual(delays, [1000, 2000, 3000]);
});

test("retries stop at the configured maximum and then fall back", () => {
  const world = loadStartup();
  failUntilFallback(world);
  assert.equal(world.messaging.calls.length, world.configLoadState.maxRetries + 1);
  assert.equal(
    world.clock.pending().filter(function (t) {
      return t.delay <= 3000;
    }).length,
    0
  );
  assert.ok(world.api.getConfig().general);
  assert.equal(world.api.getConfig().general.fnswitch.fnmges, false);
});

test("a valid cached config is adopted and starts listeners without a recovery banner", () => {
  const cached = {
    general: { fnswitch: { fnmges: true }, exclusion: { exclusion: false } },
  };
  const pageStorage = {};
  pageStorage[PAGE_STORAGE_BACKUP_KEY] = JSON.stringify(cached);
  const world = loadStartup({ pageStorage: pageStorage });
  failUntilFallback(world);
  assert.equal(world.api.getConfig().general.fnswitch.fnmges, true);
  assert.equal(world.inits.length, 1);
  assert.equal(world.document.banners.length, 0);
});

test("a cached config that cannot be parsed is ignored without throwing", () => {
  const pageStorage = {};
  pageStorage[PAGE_STORAGE_BACKUP_KEY] = "{not json";
  const world = loadStartup({ pageStorage: pageStorage });
  assert.doesNotThrow(function () {
    failUntilFallback(world);
  });
  assert.equal(world.api.getConfig().general.fnswitch.fnmges, false);
  assert.equal(world.inits.length, 0);
  assert.equal(world.document.banners.length, 1);
});

test("a cached config without a general section is rejected", () => {
  const pageStorage = {};
  pageStorage[PAGE_STORAGE_BACKUP_KEY] = JSON.stringify({ mges: { ui: {} } });
  const world = loadStartup({ pageStorage: pageStorage });
  failUntilFallback(world);
  assert.equal(world.api.getConfig().mges.ui.direct.enable, false);
  assert.equal(world.api.getConfig().general.fnswitch.fnmges, false);
  assert.equal(world.inits.length, 0);
});

test("with no usable cache a minimal config turns every gesture type off and leaves exclusion disabled", () => {
  const world = loadStartup();
  failUntilFallback(world);
  const fnswitch = world.api.getConfig().general.fnswitch;
  for (const key of Object.keys(fnswitch)) {
    assert.equal(fnswitch[key], false, key + " should be off on the minimal config");
  }
  assert.equal(world.api.getConfig().general.exclusion.exclusion, false);
  assert.equal(world.api.getConfig().general.settings.timeoutvalue, 2000);
  assert.equal(world.api.getConfig().general.settings.minlength, 10);
  assert.equal(world.inits.length, 0);
});

test("the minimal-config path shows the recovery notification", () => {
  const world = loadStartup();
  failUntilFallback(world);
  assert.equal(world.document.banners.length, 1);
});

test("at most one notification is shown per frame whichever path fires first", () => {
  const cachedMiss = loadStartup();
  failUntilFallback(cachedMiss);
  assert.equal(cachedMiss.document.banners.length, 1);
  cachedMiss.api.handleConfigLoadError("Extension context invalidated");
  assert.equal(cachedMiss.document.banners.length, 1);

  const invalidated = loadStartup();
  invalidated.api.loadConfigWithRetry();
  invalidated.messaging.reply(null, { message: "Extension context invalidated" });
  assert.equal(invalidated.document.banners.length, 1);
  invalidated.api.tryFallbackConfig();
  assert.equal(invalidated.document.banners.length, 1);
});

test("the page-storage backup is written under the pre-rename key", () => {
  const conf = { general: { fnswitch: { fnmges: true } } };
  const world = loadStartup({ config: conf });
  world.api.backupConfigToLocal();
  assert.equal(
    world.localStorage.getItem(PAGE_STORAGE_BACKUP_KEY),
    JSON.stringify(conf)
  );
});

test("a failed backup write is swallowed", () => {
  const world = loadStartup({
    config: { general: { fnswitch: {} } },
    pageStorageOpts: { throwOnSet: new Error("quota") },
  });
  assert.doesNotThrow(function () {
    world.api.backupConfigToLocal();
  });
});

test("a backup is written only when there is a config with a general section", () => {
  const world = loadStartup({ config: { mges: {} } });
  world.api.backupConfigToLocal();
  assert.equal(world.localStorage.getItem(PAGE_STORAGE_BACKUP_KEY), null);

  const withGeneral = loadStartup({ config: { general: {} } });
  withGeneral.api.backupConfigToLocal();
  assert.equal(
    withGeneral.localStorage.getItem(PAGE_STORAGE_BACKUP_KEY),
    JSON.stringify({ general: {} })
  );
});

test("a change to feature switches, exclusion, general settings, or drag click-cancel is worth a reload", () => {
  const base = {
    general: {
      fnswitch: { fnmges: true },
      exclusion: { exclusion: false },
      settings: { timeoutvalue: 2000 },
    },
    drg: { settings: { clickcancel: false } },
  };
  function nested(mutate) {
    const oldValue = JSON.parse(JSON.stringify(base));
    const newValue = JSON.parse(JSON.stringify(base));
    mutate(newValue);
    return { config: { oldValue: oldValue, newValue: newValue } };
  }
  assert.equal(
    watchedConfigChanged(
      nested(function (c) {
        c.general.fnswitch.fnmges = false;
      })
    ),
    true
  );
  assert.equal(
    watchedConfigChanged(
      nested(function (c) {
        c.general.exclusion.exclusion = true;
      })
    ),
    true
  );
  assert.equal(
    watchedConfigChanged(
      nested(function (c) {
        c.general.settings.timeoutvalue = 1000;
      })
    ),
    true
  );
  assert.equal(
    watchedConfigChanged(
      nested(function (c) {
        c.drg.settings.clickcancel = true;
      })
    ),
    true
  );
});

test("a change to action or gesture mappings is not worth a reload", () => {
  const oldValue = {
    general: { fnswitch: { fnmges: true }, exclusion: {}, settings: {} },
    drg: { settings: { clickcancel: false } },
    mges: { mges: [{ name: "back" }] },
    tdrg: { tdrg: [{ name: "copy" }] },
  };
  const newValue = JSON.parse(JSON.stringify(oldValue));
  newValue.mges.mges = [{ name: "close" }];
  newValue.tdrg.tdrg = [{ name: "open" }];
  assert.equal(
    watchedConfigChanged({ config: { oldValue: oldValue, newValue: newValue } }),
    false
  );
});

test("the nested local-storage shape and the flattened sync-storage shape both evaluate watched sections", () => {
  assert.equal(
    watchedConfigChanged({
      config: {
        oldValue: { general: { fnswitch: { fnmges: true } } },
        newValue: { general: { fnswitch: { fnmges: false } } },
      },
    }),
    true
  );
  assert.equal(
    watchedConfigChanged({
      general: {
        oldValue: { fnswitch: { fnmges: true } },
        newValue: { fnswitch: { fnmges: false } },
      },
    }),
    true
  );
  assert.equal(
    watchedConfigChanged({
      drg: {
        oldValue: { settings: { clickcancel: false } },
        newValue: { settings: { clickcancel: true } },
      },
    }),
    true
  );
});

test("the removal half of a clear-then-set is ignored", () => {
  assert.equal(
    watchedConfigChanged({
      config: {
        oldValue: { general: { fnswitch: { fnmges: true } } },
        newValue: undefined,
      },
    }),
    false
  );
});

test("a storage change touching nothing watched is not worth a reload", () => {
  assert.equal(
    watchedConfigChanged({
      version: { oldValue: 46, newValue: 47 },
      mges: { oldValue: { a: 1 }, newValue: { a: 2 } },
    }),
    false
  );
});

test("reload scheduling is inert before startup has succeeded once", () => {
  const world = loadStartup();
  world.api.scheduleConfigReload();
  assert.equal(world.clock.pending().length, 0);
  assert.equal(world.messaging.calls.length, 0);
});

test("reload scheduling is inert once the context is invalid", () => {
  const world = loadStartup({
    extensionContextValid: false,
    configLoadState: { isInitialized: true },
  });
  world.api.scheduleConfigReload();
  assert.equal(world.clock.pending().length, 0);
  assert.equal(world.messaging.calls.length, 0);
});

test("scheduling a reload cancels the pending one rather than queueing a second", () => {
  const world = loadStartup({ configLoadState: { isInitialized: true } });
  world.api.scheduleConfigReload();
  world.api.scheduleConfigReload();
  assert.equal(world.clock.pending().length, 1);
  world.clock.runNext();
  assert.equal(world.messaging.calls.length, 1);
});

test("the scheduled reload delay falls inside the bounded jitter window", () => {
  // Jitter exists so one save does not make every frame of every tab message
  // the service worker in the same instant.
  const minWorld = loadStartup({
    configLoadState: { isInitialized: true },
    random: function () {
      return 0;
    },
  });
  minWorld.api.scheduleConfigReload();
  assert.equal(minWorld.clock.pending()[0].delay, 150);

  const maxWorld = loadStartup({
    configLoadState: { isInitialized: true },
    random: function () {
      return 0.998;
    },
  });
  maxWorld.api.scheduleConfigReload();
  assert.equal(maxWorld.clock.pending()[0].delay, 649);
});

test("the in-flight guard is cleared before a scheduled reload runs", () => {
  const world = loadStartup({
    configLoadState: { isInitialized: true, isLoading: true },
  });
  world.api.scheduleConfigReload();
  assert.equal(world.messaging.calls.length, 0);
  world.clock.runNext();
  assert.equal(world.messaging.calls.length, 1);
});
