"use strict";

// Shared source-extract helpers for Node tests. This file must not match
// test/*.test.js — it is not a suite.

// Replaces every comment character with a space so the result keeps the same
// indices as the original. Strings are tracked; regex literals are not, so a
// regex containing "//" would break this.
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
  const pairs = { "(": ")", "{": "}", "[": "]" };
  const open = src[openIndex];
  const close = pairs[open];
  if (!close) {
    throw new Error("not an opener: " + open + " at " + openIndex);
  }
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

function locateMethod(blanked, name) {
  const re = new RegExp("\\b" + name + "\\s*:\\s*(async\\s+)?function\\s*\\(");
  const m = re.exec(blanked);
  if (!m) throw new Error("method not found: " + name);
  if (re.test(blanked.slice(m.index + 1))) {
    throw new Error("method declared more than once: " + name);
  }
  const paren = blanked.indexOf("(", m.index);
  const brace = blanked.indexOf("{", matchingBracket(blanked, paren));
  return {
    start: m.index,
    end: matchingBracket(blanked, brace) + 1,
    brace,
    isAsync: Boolean(m[1]),
  };
}

function extractMethod(src, blanked, name) {
  const at = locateMethod(blanked, name);
  const paren = blanked.indexOf("(", at.start);
  const params = src.slice(paren, matchingBracket(blanked, paren) + 1);
  const prefix = at.isAsync ? "async function " : "function ";
  return name + ": " + prefix + params + " " + src.slice(at.brace, at.end);
}

function extractListener(src, blanked, api) {
  const marker = api + ".addListener(";
  const at = blanked.indexOf(marker);
  if (at === -1) throw new Error("listener not found: " + api);
  if (blanked.indexOf(marker, at + 1) !== -1) {
    throw new Error("more than one listener on " + api);
  }
  const paren = at + marker.length - 1;
  return src.slice(paren + 1, matchingBracket(blanked, paren));
}

function loadMethods(src, names, scope) {
  const blanked = blankComments(src);
  for (const name of names) {
    Object.assign(scope, eval("({" + extractMethod(src, blanked, name) + "})"));
  }
  return scope;
}

function locateFunction(blanked, name) {
  const re = new RegExp("\\bfunction\\s+" + name + "\\s*\\(");
  const m = re.exec(blanked);
  if (!m) throw new Error("function not found: " + name);
  if (re.test(blanked.slice(m.index + 1))) {
    throw new Error("function declared more than once: " + name);
  }
  const paren = blanked.indexOf("(", m.index);
  const brace = blanked.indexOf("{", matchingBracket(blanked, paren));
  return {
    start: m.index,
    end: matchingBracket(blanked, brace) + 1,
  };
}

function extractFunction(src, blanked, name) {
  const at = locateFunction(blanked, name);
  return src.slice(at.start, at.end);
}

// `let name = function () { ... }` or `var name = function () { ... }`.
function extractAssignedFunction(src, blanked, name) {
  const re = new RegExp(
    "\\b(?:var|let|const)\\s+" + name + "\\s*=\\s*(async\\s+)?function\\s*\\("
  );
  const m = re.exec(blanked);
  if (!m) throw new Error("assigned function not found: " + name);
  if (re.test(blanked.slice(m.index + 1))) {
    throw new Error("assigned function declared more than once: " + name);
  }
  const paren = blanked.indexOf("(", m.index);
  const brace = blanked.indexOf("{", matchingBracket(blanked, paren));
  const end = matchingBracket(blanked, brace) + 1;
  const prefix = m[1] ? "async function " : "function ";
  const params = src.slice(paren, matchingBracket(blanked, paren) + 1);
  return prefix + params + " " + src.slice(brace, end);
}

// `name: (args) => { ... }` object property.
function extractArrowMethod(src, blanked, name) {
  const re = new RegExp("\\b" + name + "\\s*:\\s*(async\\s+)?\\(");
  const m = re.exec(blanked);
  if (!m) throw new Error("arrow method not found: " + name);
  if (re.test(blanked.slice(m.index + 1))) {
    throw new Error("arrow method declared more than once: " + name);
  }
  const paren = blanked.indexOf("(", m.index);
  const afterParams = matchingBracket(blanked, paren) + 1;
  const arrow = blanked.slice(afterParams).search(/\S/);
  const atArrow = afterParams + arrow;
  if (blanked.slice(atArrow, atArrow + 2) !== "=>") {
    throw new Error("property " + name + " is not an arrow function");
  }
  const brace = blanked.indexOf("{", atArrow);
  const end = matchingBracket(blanked, brace) + 1;
  const params = src.slice(paren, matchingBracket(blanked, paren) + 1);
  const prefix = m[1] ? "async function " : "function ";
  return prefix + params + " " + src.slice(brace, end);
}

function objectLiteral(src, blanked, marker) {
  const at = blanked.indexOf(marker);
  if (at === -1) throw new Error("object marker not found: " + marker);
  if (blanked.indexOf(marker, at + 1) !== -1) {
    throw new Error("object marker found more than once: " + marker);
  }
  const brace = blanked.indexOf("{", at);
  const end = matchingBracket(blanked, brace) + 1;
  return src.slice(brace, end);
}

module.exports = {
  blankComments,
  matchingBracket,
  locateMethod,
  extractMethod,
  extractListener,
  loadMethods,
  locateFunction,
  extractFunction,
  extractAssignedFunction,
  extractArrowMethod,
  objectLiteral,
};
