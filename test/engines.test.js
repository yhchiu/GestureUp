"use strict";

const fs = require("fs");
const path = require("path");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  blankComments,
  extractMethod,
  extractFunction,
  extractAssignedFunction,
  extractArrowMethod,
} = require("./extract-source.js");

const ROOT = path.join(__dirname, "..");
const EVENT_PATH = path.join(ROOT, "js", "event.js");
const BACKGROUND_PATH = path.join(ROOT, "js", "background.js");

const eventSrc = fs.readFileSync(EVENT_PATH, "utf8");
const eventBlanked = blankComments(eventSrc);
const backgroundSrc = fs.readFileSync(BACKGROUND_PATH, "utf8");
const backgroundBlanked = blankComments(backgroundSrc);

function loadExclusion() {
  const box = {
    url: "",
    config: { general: { exclusion: { black: [], white: [] } } },
  };
  const body =
    extractFunction(eventSrc, eventBlanked, "escapeExclusionRegex") +
    "\n" +
    extractFunction(eventSrc, eventBlanked, "getExclusionTargets") +
    "\n" +
    extractFunction(eventSrc, eventBlanked, "exclusionPatternMatches") +
    "\n" +
    "function getTopLevelExclusionURL() { return box.url; }\n" +
    "return {\n" +
    "  patternMatches: exclusionPatternMatches,\n" +
    "  exclusionMatch: function (type) {\n" +
    "    var config = box.config;\n" +
    "    return (" +
    extractArrowMethod(eventSrc, eventBlanked, "exclusionMatch") +
    ")(type);\n" +
    "  }\n" +
    "};";
  const api = eval("(function (box) {\n" + body + "\n})")(box);
  return { box, api };
}

function lookupAction(message, config) {
  const fn = extractAssignedFunction(
    backgroundSrc,
    backgroundBlanked,
    "getConf"
  );
  assert.match(
    fn,
    /config\[drawType\[0\]\]/,
    "lookup must use config[drawType[0]][drawType[1]], not the unused checkAction path"
  );
  assert.doesNotMatch(
    fn,
    /config\.mges\.mges/,
    "lookup must not be the unused checkAction helper that still reads mges.mges"
  );
  return eval(
    "(function (message, config) { var getConf = " +
      fn +
      "; return getConf(); })"
  )(message, config);
}

function loadTabHelpers(curTab, curWin, theConf) {
  const sub = { curTab: curTab, curWin: curWin, theConf: theConf || {} };
  Object.assign(
    sub,
    eval(
      "({" +
        extractMethod(backgroundSrc, backgroundBlanked, "getConfValue") +
        "})"
    )
  );
  Object.assign(
    sub,
    eval("({" + extractMethod(backgroundSrc, backgroundBlanked, "getId") + "})")
  );
  Object.assign(
    sub,
    eval(
      "({" + extractMethod(backgroundSrc, backgroundBlanked, "getIndex") + "})"
    )
  );
  return sub;
}

function tabsWindow(ids, currentIndex) {
  const tabs = ids.map(function (id, index) {
    return { id: id, index: index };
  });
  return { tabs: tabs, current: tabs[currentIndex] };
}

test("a host-only exclusion pattern matches that host with or without a path", () => {
  const { api } = loadExclusion();
  assert.equal(api.patternMatches("example.com", "https://example.com"), true);
  assert.equal(
    api.patternMatches("example.com", "https://example.com/foo"),
    true
  );
  assert.equal(
    api.patternMatches("example.com", "https://other.test/foo"),
    false
  );
});

test("a path exclusion matches that path and not a deeper path unless a wildcard says so", () => {
  const { api } = loadExclusion();
  assert.equal(
    api.patternMatches("example.com/foo", "https://example.com/foo"),
    true
  );
  assert.equal(
    api.patternMatches("example.com/foo", "https://example.com/foo/bar"),
    false
  );
  assert.equal(
    api.patternMatches("example.com/foo*", "https://example.com/foo/bar"),
    true
  );
});

test("a scheme on the exclusion pattern is compared; a bare host is not", () => {
  const { api } = loadExclusion();
  assert.equal(
    api.patternMatches("https://example.com", "https://example.com/x"),
    true
  );
  assert.equal(
    api.patternMatches("https://example.com", "http://example.com/x"),
    false
  );
  assert.equal(
    api.patternMatches("example.com", "http://example.com/x"),
    true
  );
});

test("exclusion wildcards are globs and other metacharacters stay literal", () => {
  const { api } = loadExclusion();
  assert.equal(
    api.patternMatches("example.com/foo.*", "https://example.com/foo.bar"),
    true
  );
  assert.equal(
    api.patternMatches("example.com/foo.*", "https://example.com/fooXbar"),
    false
  );
  assert.equal(
    api.patternMatches("Example.COM", "https://example.com/x"),
    true
  );
});

test("empty, missing, or invalid exclusion patterns match nothing and do not throw", () => {
  const { api } = loadExclusion();
  assert.equal(api.patternMatches("", "https://example.com"), false);
  assert.equal(api.patternMatches("   ", "https://example.com"), false);
  assert.equal(api.patternMatches("example.com", ""), false);
  assert.equal(api.patternMatches("example.com", null), false);
  assert.doesNotThrow(() => {
    assert.equal(api.patternMatches("[unterminated", "https://example.com"), false);
  });
});

test("trailing slashes on a path pattern or on the URL still match", () => {
  const { api } = loadExclusion();
  assert.equal(
    api.patternMatches("example.com/foo/", "https://example.com/foo"),
    true
  );
  assert.equal(
    api.patternMatches("example.com", "https://example.com/"),
    true
  );
});

test("blacklist polarity disables on match; whitelist polarity enables only on match", () => {
  const { box, api } = loadExclusion();
  box.url = "https://example.com/secret";
  box.config = {
    general: {
      exclusion: {
        black: ["example.com"],
        white: ["example.com"],
      },
    },
  };
  assert.equal(
    api.exclusionMatch("black"),
    true,
    "blacklist match means exclusionMatch is true (gestures disabled)"
  );

  box.url = "https://other.test/";
  assert.equal(
    api.exclusionMatch("black"),
    false,
    "blacklist miss means gestures stay enabled"
  );

  box.url = "https://example.com/secret";
  assert.equal(
    api.exclusionMatch("white"),
    false,
    "whitelist match means exclusionMatch is false (gestures enabled)"
  );

  box.url = "https://other.test/";
  assert.equal(
    api.exclusionMatch("white"),
    true,
    "whitelist miss means exclusionMatch is true (gestures disabled)"
  );
});

test("live lookup resolves a direct string under the draw-type action list", () => {
  const config = {
    mges: {
      actions: [
        { direct: "L", name: "back" },
        { direct: "DR", name: "close" },
      ],
    },
  };
  const found = lookupAction(
    { drawType: ["mges", "actions"], direct: "L" },
    config
  );
  assert.equal(found.name, "back");
  assert.equal(found.direct, "L");
});

test("live lookup returns name null for an unknown direct or missing action list", () => {
  const config = {
    mges: {
      actions: [{ direct: "L", name: "back" }],
    },
  };
  const unknown = lookupAction(
    { drawType: ["mges", "actions"], direct: "X" },
    config
  );
  assert.deepEqual(unknown, { name: null });

  const empty = lookupAction(
    { drawType: ["mges", "actions"], direct: "L" },
    { mges: { actions: [] } }
  );
  assert.deepEqual(empty, { name: null });

  const missing = lookupAction(
    { drawType: ["nope", "actions"], direct: "L" },
    config
  );
  assert.deepEqual(missing, { name: null });
});

test("getConfValue returns the matching option or an empty value", () => {
  const sub = loadTabHelpers({ id: 1, index: 0 }, { tabs: [] }, {
    selects: [
      { type: "n_tab", value: "s_current" },
      { type: "n_optype", value: "s_new" },
    ],
    checks: [{ type: "n_pin", value: false }],
  });
  assert.equal(sub.getConfValue("selects", "n_tab"), "s_current");
  assert.equal(sub.getConfValue("selects", "n_optype"), "s_new");
  assert.equal(sub.getConfValue("checks", "n_pin"), false);
  assert.equal(sub.getConfValue("selects", "n_missing"), "");
  assert.equal(sub.getConfValue("texts", "n_url"), "");
});

test("tab targeting uses the current window snapshot", () => {
  const mid = tabsWindow([10, 11, 12, 13, 14], 2);
  const sub = loadTabHelpers(mid.current, mid);
  assert.deepEqual(sub.getId("s_current"), [12]);
  assert.deepEqual(sub.getId("s_head"), [10]);
  assert.deepEqual(sub.getId("s_last"), [14]);
  assert.deepEqual(sub.getId("s_left"), [11]);
  assert.deepEqual(sub.getId("s_right"), [13]);
  assert.deepEqual(sub.getId("s_lefts"), [10, 11]);
  assert.deepEqual(sub.getId("s_rights"), [13, 14]);
  assert.deepEqual(sub.getId("s_others"), [10, 11, 13, 14]);
  assert.deepEqual(sub.getId("s_all"), [10, 11, 12, 13, 14]);
  assert.deepEqual(sub.getId("s_default"), ["s_default"]);

  assert.deepEqual(sub.getIndex("s_current"), [2]);
  assert.deepEqual(sub.getIndex("s_head"), [0]);
  assert.deepEqual(sub.getIndex("s_last"), [4]);
  assert.deepEqual(sub.getIndex("s_left"), [1]);
  assert.deepEqual(sub.getIndex("s_right"), [3]);
  assert.deepEqual(sub.getIndex("s_default"), [false]);
});

test("tab targeting wraps on single-step edges and empties ranges", () => {
  const first = tabsWindow([10, 11, 12], 0);
  const atFirst = loadTabHelpers(first.current, first);
  assert.deepEqual(atFirst.getId("s_left"), [12]);
  assert.deepEqual(atFirst.getId("s_lefts"), []);
  assert.deepEqual(atFirst.getId("s_rights"), [11, 12]);
  assert.deepEqual(atFirst.getIndex("s_left"), [2]);

  const last = tabsWindow([10, 11, 12], 2);
  const atLast = loadTabHelpers(last.current, last);
  assert.deepEqual(atLast.getId("s_right"), [10]);
  assert.deepEqual(atLast.getId("s_rights"), []);
  assert.deepEqual(atLast.getId("s_lefts"), [10, 11]);
  assert.deepEqual(atLast.getIndex("s_right"), [0]);

  const only = tabsWindow([99], 0);
  const atOnly = loadTabHelpers(only.current, only);
  assert.deepEqual(atOnly.getId("s_others"), []);
  assert.deepEqual(atOnly.getId("s_all"), [99]);
  assert.deepEqual(atOnly.getId("s_left"), [99]);
});
