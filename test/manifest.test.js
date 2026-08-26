"use strict";

const fs = require("fs");
const path = require("path");
const { test } = require("node:test");
const assert = require("node:assert/strict");

const ROOT = path.join(__dirname, "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8")
);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

const FILE_EXT =
  /\.(js|mjs|cjs|css|html|htm|json|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|map)$/i;

function isFileRef(value) {
  if (typeof value !== "string") return false;
  if (value.startsWith("__MSG_")) return false;
  if (value === "<all_urls>") return false;
  if (value.includes("://")) return false;
  if (value.includes("*")) return true;
  return FILE_EXT.test(value);
}

function collectFileRefs(value, acc) {
  if (typeof value === "string") {
    if (isFileRef(value)) acc.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectFileRefs(item, acc);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectFileRefs(item, acc);
  }
}

function manifestFileRefs() {
  const acc = [];
  collectFileRefs(manifest, acc);
  return [...new Set(acc)];
}

function globToRegExp(glob) {
  let out = "^";
  for (const ch of glob) {
    if (ch === "*") out += "[^/]*";
    else if (".+?^${}()|[]\\".includes(ch)) out += "\\" + ch;
    else out += ch;
  }
  return new RegExp(out + "$");
}

function listFiles(dir, base) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === ".git" || ent.name === "node_modules") continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}

test("every literal file path the manifest names exists on disk", () => {
  const missing = [];
  for (const ref of manifestFileRefs()) {
    if (ref.includes("*")) continue;
    const onDisk = path.join(ROOT, ...ref.split("/"));
    if (!fs.existsSync(onDisk)) missing.push(ref);
  }
  assert.deepEqual(
    missing,
    [],
    "the manifest names these files, which are not in the package:\n" +
      missing.join("\n")
  );
});

test("every wildcard web-accessible resource matches at least one file", () => {
  const files = listFiles(ROOT, ROOT);
  const empty = [];
  for (const ref of manifestFileRefs()) {
    if (!ref.includes("*")) continue;
    const re = globToRegExp(ref);
    if (!files.some((file) => re.test(file))) empty.push(ref);
  }
  assert.deepEqual(
    empty,
    [],
    "these wildcard resources match no files:\n" + empty.join("\n")
  );
});

test("the default locale named by the manifest has a messages file", () => {
  const locale = manifest.default_locale;
  assert.equal(typeof locale, "string");
  const messages = path.join(ROOT, "_locales", locale, "messages.json");
  assert.equal(fs.existsSync(messages), true, messages + " is missing");
});

test("the package version equals the manifest version", () => {
  // The manifest is the source of truth for the extension version. When
  // these drift, change package.json to match the manifest, not the other way.
  assert.equal(pkg.version, manifest.version);
});
