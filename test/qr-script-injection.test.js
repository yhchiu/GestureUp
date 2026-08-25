"use strict";

const fs = require("fs");
const path = require("path");
const { test } = require("node:test");
const assert = require("node:assert/strict");

const BACKGROUND_PATH = path.join(__dirname, "..", "js", "background.js");
const backgroundSrc = fs.readFileSync(BACKGROUND_PATH, "utf8");

// MV3 scripting.ScriptInjection keys (Chrome 88+). Anything else is rejected
// with "Unexpected property: '<name>'" — the error reported for the QR action.
const SCRIPT_INJECTION_KEYS = new Set([
  "args",
  "files",
  "func",
  "function",
  "injectImmediately",
  "target",
  "world",
]);

const CSS_INJECTION_KEYS = new Set(["css", "files", "origin", "target"]);

function chromeExecuteScriptError(detail) {
  return new TypeError(
    "Error in invocation of scripting.executeScript(scripting.ScriptInjection injection, optional function callback): Error at parameter 'injection': " +
      detail
  );
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
  if (!("target" in injection) || injection.target == null) {
    throw chromeExecuteScriptError(
      "Error at property 'target': Property is required."
    );
  }
  if (injection.target.tabId == null) {
    throw chromeExecuteScriptError(
      "Error at property 'target': Error at property 'tabId': Property is required."
    );
  }
  const hasFiles = Object.prototype.hasOwnProperty.call(injection, "files");
  const hasFunc =
    Object.prototype.hasOwnProperty.call(injection, "func") ||
    Object.prototype.hasOwnProperty.call(injection, "function");
  if (hasFiles === hasFunc) {
    throw chromeExecuteScriptError(
      "Exactly one of 'func' and 'files' must be specified."
    );
  }
}

function validateCSSInjection(injection) {
  if (
    injection == null ||
    typeof injection !== "object" ||
    Array.isArray(injection)
  ) {
    throw new TypeError(
      "Error in invocation of scripting.insertCSS: unexpected type."
    );
  }
  for (const key of Object.keys(injection)) {
    if (!CSS_INJECTION_KEYS.has(key)) {
      throw new TypeError(
        "Error in invocation of scripting.insertCSS: Unexpected property: '" +
          key +
          "'."
      );
    }
  }
  if (!injection.target || injection.target.tabId == null) {
    throw new TypeError(
      "Error in invocation of scripting.insertCSS: target.tabId is required."
    );
  }
}

function extractBalanced(src, braceIndex) {
  if (src[braceIndex] !== "{") {
    throw new Error("expected '{' at " + braceIndex);
  }
  let depth = 0;
  let inStr = null;
  let escape = false;
  for (let i = braceIndex; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      i = src.indexOf("\n", i);
      if (i === -1) break;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i = src.indexOf("*/", i + 2);
      if (i === -1) break;
      i += 1;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return src.slice(braceIndex, i + 1);
    }
  }
  throw new Error("unbalanced braces from " + braceIndex);
}

function extractMethod(src, name) {
  const re = new RegExp("\\b" + name + "\\s*:\\s*function\\s*\\(");
  const m = re.exec(src);
  if (!m) throw new Error("method not found: " + name);
  const paren = src.indexOf("(", m.index);
  const brace = src.indexOf("{", paren);
  const params = src.slice(paren, brace).trim();
  return name + ": function " + params + " " + extractBalanced(src, brace);
}

function extractCaseBlock(src, caseLabel, nextCaseLabel) {
  const start = src.indexOf(caseLabel);
  if (start === -1) throw new Error("missing " + caseLabel);
  const end = src.indexOf(nextCaseLabel, start + caseLabel.length);
  if (end === -1) throw new Error("missing " + nextCaseLabel);
  return src.slice(start, end);
}

function loadQrInjectionSub() {
  const executeScriptCalls = [];
  const insertCSSCalls = [];
  const tabsInsertCSSCalls = [];

  const chrome = {
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
        callback([{ id: 42, active: true }]);
      },
      insertCSS: function (details, callback) {
        tabsInsertCSSCalls.push(details);
        throw new TypeError("chrome.tabs.insertCSS is not a function");
      },
    },
    runtime: {
      sendMessage: function () {},
    },
  };

  const sub = {
    curTab: { id: 42 },
    cons: {},
  };

  const methodNames = [
    "injectFunc",
    "injectFiles",
    "injectCSS",
    "insertTest",
  ];
  for (const name of methodNames) {
    try {
      const fnSrc = extractMethod(backgroundSrc, name);
      Object.assign(sub, eval("({" + fnSrc + "})"));
    } catch (err) {
      if (name === "insertTest") throw err;
    }
  }

  return {
    chrome,
    sub,
    executeScriptCalls,
    insertCSSCalls,
    tabsInsertCSSCalls,
  };
}

test("insertTest('qr') does not pass code to chrome.scripting.executeScript", () => {
  const ctx = loadQrInjectionSub();
  const previousChrome = global.chrome;
  global.chrome = ctx.chrome;
  try {
    assert.doesNotThrow(() => {
      ctx.sub.insertTest("qr");
    }, "insertTest should not throw Chrome's Unexpected property: 'code' error");
  } finally {
    global.chrome = previousChrome;
  }

  assert.ok(
    ctx.executeScriptCalls.length >= 1,
    "insertTest must call chrome.scripting.executeScript"
  );
  const injection = ctx.executeScriptCalls[0];
  assert.equal(injection.target.tabId, 42);
  const fn = injection.func || injection.function;
  assert.equal(typeof fn, "function");
  assert.deepEqual(injection.args, ["qr"]);

  const serialized = fn.toString();
  assert.match(
    serialized,
    /apps_test/,
    "injected function must send the apps_test message that loads the QR UI"
  );
  assert.match(serialized, /apptype/);
});

test("apps_test handler does not use MV2 executeScript/insertCSS shape", () => {
  const block = extractCaseBlock(
    backgroundSrc,
    'case "apps_test":',
    'case "getappconf":'
  );

  assert.doesNotMatch(
    block,
    /\bcode\s*:/,
    "apps_test still passes 'code' to executeScript; MV3 scripting.executeScript rejects it, so the QR UI never injects"
  );
  assert.doesNotMatch(
    block,
    /\bfile\s*:/,
    "apps_test still uses MV2 'file' instead of MV3 'files'"
  );
  assert.doesNotMatch(
    block,
    /chrome\.tabs\.insertCSS/,
    "apps_test still uses chrome.tabs.insertCSS, which is gone in MV3"
  );
  assert.doesNotMatch(
    block,
    /\brunAt\s*:/,
    "apps_test still passes runAt, which is not a ScriptInjection property"
  );
});
