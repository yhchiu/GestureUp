"use strict";

const fs = require("fs");
const path = require("path");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  blankComments,
  matchingBracket,
  extractMethod,
  objectLiteral,
} = require("./extract-source.js");

const ROOT = path.join(__dirname, "..");
const ACTIONS_PATH = path.join(ROOT, "js", "actions.js");
const BACKGROUND_PATH = path.join(ROOT, "js", "background.js");
const INJECT_DIR = path.join(ROOT, "js", "inject");
const EN_MESSAGES_PATH = path.join(ROOT, "_locales", "en", "messages.json");

const actionsSrc = fs.readFileSync(ACTIONS_PATH, "utf8");
const backgroundSrc = fs.readFileSync(BACKGROUND_PATH, "utf8");
const actionsBlanked = blankComments(actionsSrc);
const backgroundBlanked = blankComments(backgroundSrc);

// paste is not a missing handler. The service worker message switch handles
// it with clipboard permission and a content-script actionPaste message.
// Do not add a background handler just to satisfy this list.
const CATALOG_NAMES_WITHOUT_HANDLER = new Set(["paste"]);

// none is the no-op catalog entry. zoom_dep, restart, and exit are the
// deprecated group; exit currently has no English key and this suite must
// stay green without a production string change.
const CATALOG_NAMES_WITHOUT_ENGLISH_KEY = new Set([
  "none",
  "zoom_dep",
  "restart",
  "exit",
]);

function loadActionsCatalog() {
  return eval("(" + objectLiteral(actionsSrc, actionsBlanked, "let actions=") + ")");
}

function collectCatalogNames(catalog) {
  const names = new Set();
  for (const key of ["mges", "tdrg", "ldrg", "idrg"]) {
    const groups = catalog[key];
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (!Array.isArray(group)) continue;
      for (const item of group) {
        if (item && typeof item.name === "string") names.add(item.name);
      }
    }
  }
  return names;
}

function appsGroupNames(catalog) {
  const idx = catalog.mges_group.indexOf("ag_apps");
  if (idx < 0) throw new Error("ag_apps group missing from mges_group");
  const group = catalog.mges[idx];
  if (!Array.isArray(group)) throw new Error("mges apps group is not an array");
  return group.map((item) => item.name).filter((name) => name && name !== "none");
}

function loadHandlerNames() {
  const start = backgroundBlanked.indexOf("\n  action: {");
  if (start === -1) throw new Error("action map not found");
  if (backgroundBlanked.indexOf("\n  action: {", start + 1) !== -1) {
    throw new Error("action map declared more than once");
  }
  const upgrade = backgroundBlanked.indexOf("\n  upgrade: {", start);
  if (upgrade === -1) throw new Error("upgrade map not found after action map");
  const block = backgroundBlanked.slice(start, upgrade);
  const names = new Set();
  const re = /\n    ([A-Za-z_][A-Za-z0-9_]*): (?:async )?function/g;
  let m;
  while ((m = re.exec(block))) names.add(m[1]);
  // A truncated slice of the action map would still look like handlers.
  if (names.size < 50) {
    throw new Error("expected a full action map, saw " + names.size);
  }
  return names;
}

function loadDefaultConf() {
  const previousChrome = global.chrome;
  const getDefault = {
    i18n: function (str) {
      return str;
    },
  };
  global.chrome = {
    i18n: {
      getMessage: function () {
        return "";
      },
    },
  };
  try {
    const valueFn = eval(
      "(" +
        extractMethod(backgroundSrc, backgroundBlanked, "value").replace(
          /^value:\s*/,
          ""
        ) +
        ")"
    );
    return valueFn.call(getDefault);
  } finally {
    global.chrome = previousChrome;
  }
}

function collectDefaultActionNames(conf) {
  const names = new Set();
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) {
        if (
          item &&
          typeof item.name === "string" &&
          // Search engines and user scripts use `name` plus `content`.
          !Object.prototype.hasOwnProperty.call(item, "content")
        ) {
          names.add(item.name);
        }
        walk(item);
      }
      return;
    }
    for (const value of Object.values(node)) walk(value);
  }
  walk(conf);
  return names;
}

function loadUpgradeSteps() {
  const start = backgroundBlanked.indexOf("\n  upgrade: {");
  if (start === -1) throw new Error("upgrade map not found");
  if (backgroundBlanked.indexOf("\n  upgrade: {", start + 1) !== -1) {
    throw new Error("upgrade map declared more than once");
  }
  const brace = backgroundBlanked.indexOf("{", start);
  const block = backgroundBlanked.slice(
    start,
    matchingBracket(backgroundBlanked, brace) + 1
  );
  const steps = new Set();
  const re = /\n    _(\d+): (?:async )?function/g;
  let m;
  while ((m = re.exec(block))) steps.add(Number(m[1]));
  return steps;
}

function loadEnglishKeys() {
  const raw = fs.readFileSync(EN_MESSAGES_PATH, "utf8").replace(/^\uFEFF/, "");
  return new Set(Object.keys(JSON.parse(raw)));
}

const catalog = loadActionsCatalog();
const catalogNames = collectCatalogNames(catalog);
const handlerNames = loadHandlerNames();

test("every live catalog action has a background handler", () => {
  for (const name of CATALOG_NAMES_WITHOUT_HANDLER) {
    assert.ok(
      catalogNames.has(name),
      "exception " + name + " is not in the live catalog"
    );
    assert.ok(
      !handlerNames.has(name),
      name + " now has a background handler; remove it from the exception list"
    );
  }

  const missing = [...catalogNames]
    .filter(
      (name) =>
        !handlerNames.has(name) && !CATALOG_NAMES_WITHOUT_HANDLER.has(name)
    )
    .sort();
  assert.deepEqual(
    missing,
    [],
    "these catalog actions have no sub.action handler:\n" + missing.join("\n")
  );
});

test("default-config action names are in the live catalog", () => {
  const defaultConf = loadDefaultConf();
  const defaultNames = collectDefaultActionNames(defaultConf);
  const missing = [...defaultNames]
    .filter((name) => !catalogNames.has(name))
    .sort();
  assert.deepEqual(
    missing,
    [],
    "these default-config action names are not in the catalog:\n" +
      missing.join("\n")
  );
});

test("default-config version has a contiguous upgrade chain from 31", () => {
  const defaultConf = loadDefaultConf();
  const version = defaultConf.version;
  assert.equal(typeof version, "number");
  const steps = loadUpgradeSteps();
  const missing = [];
  for (let n = 31; n <= version; n++) {
    if (!steps.has(n)) missing.push(n);
  }
  assert.deepEqual(
    missing,
    [],
    "defaultConf.version is " +
      version +
      " but these upgrade._N functions are missing: " +
      missing.join(", ")
  );
});

test("every live apps-group catalog name has an inject file", () => {
  const injectFiles = new Set(
    fs
      .readdirSync(INJECT_DIR)
      .filter((file) => file.endsWith(".js"))
      .map((file) => path.basename(file, ".js"))
  );
  const missing = appsGroupNames(catalog)
    .filter((name) => !injectFiles.has(name))
    .sort();
  assert.deepEqual(
    missing,
    [],
    "these apps-group actions have no js/inject/<name>.js:\n" + missing.join("\n")
  );
});

test("live non-deprecated catalog names have English message keys", () => {
  const english = loadEnglishKeys();
  const missing = [...catalogNames]
    .filter(
      (name) =>
        !CATALOG_NAMES_WITHOUT_ENGLISH_KEY.has(name) && !english.has(name)
    )
    .sort();
  assert.deepEqual(
    missing,
    [],
    "these catalog actions have no English message key:\n" + missing.join("\n")
  );
});
