"use strict";

const fs = require("fs");
const path = require("path");
const { test } = require("node:test");
const assert = require("node:assert/strict");

const BACKGROUND_PATH = path.join(__dirname, "..", "js", "background.js");
const backgroundSrc = fs.readFileSync(BACKGROUND_PATH, "utf8");

// MV3 scripting.ScriptInjection keys. Anything else is rejected with
// "Unexpected property: '<name>'" — the error reported for the QR action.
// The deprecated "function" spelling is deliberately absent: Chrome renamed it
// to "func", and nothing in background.js may go back to the old name.
const SCRIPT_INJECTION_KEYS = new Set([
  "args",
  "files",
  "func",
  "injectImmediately",
  "target",
  "world",
]);

const CSS_INJECTION_KEYS = new Set(["css", "files", "origin", "target"]);

const INJECTION_TARGET_KEYS = new Set([
  "allFrames",
  "documentIds",
  "frameIds",
  "tabId",
]);

// These three are the only callers allowed to pass a variable to
// chrome.scripting; every other call site must spell out its injection object
// inline so this suite can check the object's keys.
const INJECTION_HELPERS = ["injectFiles", "injectFunc", "injectCSS"];

function chromeExecuteScriptError(detail) {
  return new TypeError(
    "Error in invocation of scripting.executeScript(scripting.ScriptInjection injection, optional function callback): Error at parameter 'injection': " +
      detail
  );
}

function validateTarget(injection, makeError) {
  if (!("target" in injection) || injection.target == null) {
    throw makeError("Error at property 'target': Property is required.");
  }
  for (const key of Object.keys(injection.target)) {
    if (!INJECTION_TARGET_KEYS.has(key)) {
      throw makeError(
        "Error at property 'target': Unexpected property: '" + key + "'."
      );
    }
  }
  if (injection.target.tabId == null) {
    throw makeError(
      "Error at property 'target': Error at property 'tabId': Property is required."
    );
  }
  if (typeof injection.target.tabId !== "number") {
    throw makeError(
      "Error at property 'target': Error at property 'tabId': Expected integer."
    );
  }
}

function validateScriptInjection(injection) {
  if (
    injection == null ||
    typeof injection !== "object" ||
    Array.isArray(injection)
  ) {
    throw chromeExecuteScriptError("Unexpected type.");
  }
  for (const key of Object.keys(injection)) {
    if (!SCRIPT_INJECTION_KEYS.has(key)) {
      throw chromeExecuteScriptError("Unexpected property: '" + key + "'.");
    }
  }
  validateTarget(injection, chromeExecuteScriptError);
  const hasFiles = Object.prototype.hasOwnProperty.call(injection, "files");
  const hasFunc = Object.prototype.hasOwnProperty.call(injection, "func");
  if (hasFiles === hasFunc) {
    throw chromeExecuteScriptError(
      "Exactly one of 'func' and 'files' must be specified."
    );
  }
  if (hasFiles && !Array.isArray(injection.files)) {
    throw chromeExecuteScriptError(
      "Error at property 'files': Invalid type: expected array."
    );
  }
}

function cssInjectionError(detail) {
  return new TypeError("Error in invocation of scripting.insertCSS: " + detail);
}

function validateCSSInjection(injection) {
  if (
    injection == null ||
    typeof injection !== "object" ||
    Array.isArray(injection)
  ) {
    throw cssInjectionError("unexpected type.");
  }
  for (const key of Object.keys(injection)) {
    if (!CSS_INJECTION_KEYS.has(key)) {
      throw cssInjectionError("Unexpected property: '" + key + "'.");
    }
  }
  validateTarget(injection, cssInjectionError);
}

// Replaces every comment character with a space so the result keeps the same
// indices as the original. Strings are tracked; regex literals are not, so a
// regex containing "//" would break this (background.js has none).
function blankComments(src) {
  const BACKTICK = String.fromCharCode(96);
  const out = src.split("");
  let inStr = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === "\\") {
        i++;
      } else if (c === inStr) {
        inStr = null;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === BACKTICK) {
      inStr = c;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") {
        out[i] = " ";
        i++;
      }
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      for (; i < stop; i++) {
        if (src[i] !== "\n") out[i] = " ";
      }
      i--;
      continue;
    }
  }
  return out.join("");
}

function matchingBracket(src, openIndex) {
  const open = src[openIndex];
  const close = open === "(" ? ")" : "}";
  let depth = 0;
  for (let i = openIndex; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error("unbalanced " + open + " from " + openIndex);
}

// Returns the character span of `name: function (...) {...}` in the
// comment-blanked source, so callers can slice either source with it.
function locateMethod(blanked, name) {
  const re = new RegExp("\\b" + name + "\\s*:\\s*function\\s*\\(");
  const m = re.exec(blanked);
  if (!m) throw new Error("method not found: " + name);
  if (re.test(blanked.slice(m.index + 1))) {
    throw new Error("method declared more than once: " + name);
  }
  const paren = blanked.indexOf("(", m.index);
  // Take the brace after the parameter list, not the first brace after "(",
  // so a destructured parameter is not mistaken for the body.
  const brace = blanked.indexOf("{", matchingBracket(blanked, paren));
  return { start: m.index, end: matchingBracket(blanked, brace) + 1, brace };
}

function extractMethod(src, blanked, name) {
  const at = locateMethod(blanked, name);
  const paren = blanked.indexOf("(", at.start);
  const params = src.slice(paren, matchingBracket(blanked, paren) + 1);
  return name + ": function " + params + " " + src.slice(at.brace, at.end);
}

function loadInjectionSub(overrides) {
  const executeScriptCalls = [];
  const insertCSSCalls = [];
  const tabsQueryCalls = [];
  const warnings = [];

  const chrome = {
    runtime: {
      lastError: undefined,
      sendMessage: function () {},
    },
    scripting: {
      executeScript: function (injection, callback) {
        validateScriptInjection(injection);
        executeScriptCalls.push(injection);
        if (typeof callback === "function") callback([{ result: undefined }]);
        return Promise.resolve([{ result: undefined }]);
      },
      insertCSS: function (injection, callback) {
        validateCSSInjection(injection);
        insertCSSCalls.push(injection);
        if (typeof callback === "function") callback();
        return Promise.resolve();
      },
    },
    tabs: {
      query: function (query, callback) {
        tabsQueryCalls.push(query);
        callback([{ id: 7, active: true }]);
      },
      // Gone in MV3. Any caller still reaching for these must fail loudly.
      insertCSS: function () {
        throw new TypeError("chrome.tabs.insertCSS is not a function");
      },
      executeScript: function () {
        throw new TypeError("chrome.tabs.executeScript is not a function");
      },
    },
  };

  const console = {
    log: function () {},
    warn: function () {
      warnings.push(Array.prototype.slice.call(arguments).join(" "));
    },
  };

  const sub = Object.assign({ curTab: { id: 42 }, cons: {} }, overrides);

  const blanked = blankComments(backgroundSrc);
  const methodNames = [
    "injectTarget",
    "injectDone",
    "injectFiles",
    "injectFunc",
    "injectCSS",
    "injectCode",
    "actionTabId",
    "withActiveTabId",
    "insertTest",
  ];
  for (const name of methodNames) {
    // A helper that can no longer be extracted is a failure, never a skip:
    // silently dropping one would leave the suite green on broken code.
    const fnSrc = extractMethod(backgroundSrc, blanked, name);
    Object.assign(sub, eval("({" + fnSrc + "})"));
  }

  return {
    chrome,
    console,
    sub,
    executeScriptCalls,
    insertCSSCalls,
    tabsQueryCalls,
    warnings,
  };
}

function lineOf(index) {
  return backgroundSrc.slice(0, index).split("\n").length;
}

// Property names at the top level of an object literal, ignoring anything
// nested inside braces, brackets, parens (arrow-function bodies included) or
// strings. Feed it comment-blanked source.
function topLevelKeys(objSrc) {
  const BACKTICK = String.fromCharCode(96);
  const keys = [];
  let depth = 0;
  let inStr = null;
  let expectKey = false;
  let buf = "";
  for (let i = 0; i < objSrc.length; i++) {
    const c = objSrc[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === BACKTICK) {
      inStr = c;
      continue;
    }
    if (c === "{" || c === "(" || c === "[") {
      depth++;
      if (depth === 1) {
        expectKey = true;
        buf = "";
      }
      continue;
    }
    if (c === "}" || c === ")" || c === "]") {
      depth--;
      continue;
    }
    if (depth !== 1) continue;
    if (c === ",") {
      expectKey = true;
      buf = "";
    } else if (c === ":" && expectKey) {
      keys.push(buf.trim().replace(/^["']|["']$/g, ""));
      expectKey = false;
      buf = "";
    } else if (expectKey) {
      buf += c;
    }
  }
  return keys;
}

test("no chrome.scripting call in background.js uses a shape Chrome rejects", () => {
  const blanked = blankComments(backgroundSrc);
  const spans = INJECTION_HELPERS.map((name) => locateMethod(blanked, name));

  const problems = [];
  const re = /chrome\.scripting\.(executeScript|insertCSS)\s*\(/g;
  let m;
  let checked = 0;
  while ((m = re.exec(blanked)) !== null) {
    const inHelper = spans.some(
      (span) => m.index >= span.start && m.index < span.end
    );
    if (inHelper) continue;

    const where = "js/background.js:" + lineOf(m.index);
    const argStart = m.index + m[0].length;
    const firstArg = blanked.slice(argStart).search(/\S/) + argStart;
    if (blanked[firstArg] !== "{") {
      // The MV2 signature was executeScript(tabId, details); MV3 takes the
      // injection object first and has no tabId parameter at all.
      problems.push(
        where + " passes " + blanked.slice(firstArg, firstArg + 12).trim() +
          " as the first argument instead of an injection object"
      );
      continue;
    }

    checked++;
    const objSrc = blanked.slice(firstArg, matchingBracket(blanked, firstArg) + 1);
    const allowed =
      m[1] === "insertCSS" ? CSS_INJECTION_KEYS : SCRIPT_INJECTION_KEYS;
    for (const key of topLevelKeys(objSrc)) {
      if (!allowed.has(key)) {
        problems.push(
          where + " passes '" + key + "', which " + m[1] + " rejects with " +
            "\"Unexpected property: '" + key + "'\""
        );
      }
    }
    if (!topLevelKeys(objSrc).includes("target")) {
      problems.push(where + " has no target, which is required in MV3");
    }
  }

  assert.deepEqual(problems, [], problems.join("\n"));
  assert.ok(
    checked > 20,
    "expected to have checked every inline injection object, saw " + checked
  );
});

test("background.js has no MV2 injection leftovers", () => {
  const blanked = blankComments(backgroundSrc);
  const leftovers = [];
  const patterns = [
    [
      /chrome\.tabs\.executeScript/g,
      "chrome.tabs.executeScript is gone in MV3",
    ],
    [/chrome\.tabs\.insertCSS/g, "chrome.tabs.insertCSS is gone in MV3"],
    [/\brunAt\s*:/g, "runAt is not a ScriptInjection property"],
    [/\bfunction\s*:\s*function\b/g, "the 'function' key was renamed to 'func'"],
  ];
  for (const [re, why] of patterns) {
    let m;
    while ((m = re.exec(blanked)) !== null) {
      leftovers.push("js/background.js:" + lineOf(m.index) + " — " + why);
    }
  }
  assert.deepEqual(leftovers, [], leftovers.join("\n"));
});

test("insertTest('qr') asks the page whether the QR app is loaded", () => {
  const ctx = loadInjectionSub();
  const previousChrome = global.chrome;
  global.chrome = ctx.chrome;
  try {
    assert.doesNotThrow(() => {
      ctx.sub.insertTest("qr");
    }, "insertTest must not trip Chrome's Unexpected property check");
  } finally {
    global.chrome = previousChrome;
  }

  assert.equal(ctx.executeScriptCalls.length, 1);
  const injection = ctx.executeScriptCalls[0];
  assert.equal(injection.target.tabId, 42);
  assert.equal(typeof injection.func, "function");
  assert.deepEqual(injection.args, ["qr"]);
  assert.equal(injection.injectImmediately, true);

  const serialized = injection.func.toString();
  assert.match(
    serialized,
    /apps_test/,
    "injected function must send the apps_test message that loads the QR UI"
  );
  assert.match(serialized, /apptype/);
});

test("insertTest falls back to a live tab query when curTab is unset", () => {
  const ctx = loadInjectionSub({ curTab: null });
  const previousChrome = global.chrome;
  global.chrome = ctx.chrome;
  try {
    ctx.sub.insertTest("qr");
  } finally {
    global.chrome = previousChrome;
  }

  assert.deepEqual(ctx.tabsQueryCalls, [{ active: true, currentWindow: true }]);
  assert.equal(ctx.executeScriptCalls.length, 1);
  assert.equal(ctx.executeScriptCalls[0].target.tabId, 7);
});

test("injectFiles and injectCSS produce injections Chrome accepts", () => {
  const ctx = loadInjectionSub();
  const previousChrome = global.chrome;
  global.chrome = ctx.chrome;
  try {
    ctx.sub.injectFiles(42, "js/inject/zoom.js");
    ctx.sub.injectFiles(42, ["js/namespace.js", "js/inject/np.js"], null, {
      allFrames: true,
    });
    ctx.sub.injectCSS(42, "css/apps_basic.css");
  } finally {
    global.chrome = previousChrome;
  }

  assert.deepEqual(ctx.executeScriptCalls[0], {
    target: { tabId: 42 },
    files: ["js/inject/zoom.js"],
    injectImmediately: true,
  });
  assert.deepEqual(ctx.executeScriptCalls[1], {
    target: { tabId: 42, allFrames: true },
    files: ["js/namespace.js", "js/inject/np.js"],
    injectImmediately: true,
  });
  assert.deepEqual(ctx.insertCSSCalls, [
    { target: { tabId: 42 }, files: ["css/apps_basic.css"] },
  ]);
});

test("injectCode runs a user script through a page-world script element", () => {
  const ctx = loadInjectionSub();
  const previousChrome = global.chrome;
  global.chrome = ctx.chrome;
  try {
    ctx.sub.injectCode(42, "alert('test script 1.')");
    ctx.sub.injectCode(42, "");
  } finally {
    global.chrome = previousChrome;
  }

  assert.equal(
    ctx.executeScriptCalls.length,
    1,
    "empty script content must not be injected"
  );
  const injection = ctx.executeScriptCalls[0];
  assert.equal(injection.world, "MAIN");
  assert.deepEqual(injection.args, ["alert('test script 1.')"]);
  assert.doesNotMatch(
    injection.func.toString(),
    /\beval\b|new Function/,
    "user scripts go in as a script element, not through eval"
  );
});

test("a failed injection is reported instead of passing silently", () => {
  const ctx = loadInjectionSub();
  const previousChrome = global.chrome;
  const previousConsole = global.console;
  global.chrome = ctx.chrome;
  global.console = ctx.console;
  let ran = false;
  try {
    ctx.chrome.runtime.lastError = {
      message: "Cannot access contents of the page.",
    };
    ctx.sub.injectFiles(42, "js/inject/zoom.js", function () {
      ran = true;
    });
  } finally {
    ctx.chrome.runtime.lastError = undefined;
    global.chrome = previousChrome;
    global.console = previousConsole;
  }

  assert.equal(ctx.warnings.length, 1);
  assert.match(ctx.warnings[0], /inject failed: js\/inject\/zoom\.js/);
  assert.match(ctx.warnings[0], /Cannot access contents of the page\./);
  assert.equal(ran, true, "the caller's callback still runs");
});

test("withActiveTabId warns when there is no tab to inject into", () => {
  const ctx = loadInjectionSub({ curTab: null });
  ctx.chrome.tabs.query = function (query, callback) {
    callback([]);
  };
  const previousChrome = global.chrome;
  const previousConsole = global.console;
  global.chrome = ctx.chrome;
  global.console = ctx.console;
  let ran = false;
  try {
    ctx.sub.withActiveTabId(function () {
      ran = true;
    });
  } finally {
    global.chrome = previousChrome;
    global.console = previousConsole;
  }

  assert.equal(ran, false);
  assert.deepEqual(ctx.warnings, ["no active tab to inject into"]);
});
