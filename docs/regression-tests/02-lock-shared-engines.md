# 02 — Lock exclusion matching, action lookup, and tab targeting

**What to build:** Running the Node test command also fails when shared engines change their results. Exclusion patterns keep today’s host, path, scheme, wildcard, case, blank, trailing-slash, and fail-closed behaviour; blacklist polarity disables on match and whitelist polarity enables only on match. A gesture `direct` string resolves through the live tip/action lookup (`config[drawType[0]][drawType[1]]` by `direct`) to the matching action config, or to a config whose name is null when the direct is unknown or the action list is missing/empty. The unused `checkAction` helper is not the seam. Option lookup returns the configured value for a key on the current action, and an empty value rather than a throw when the key is absent. Tab id and tab index helpers, given a fake current tab and window, keep wrap-around on single-step left/right, empty ranges at the edge, empty others in a one-tab window, exhaustive `s_all`, and `s_default` as a sentinel. Production code stays frozen.

**Blocked by:** 01 — Lock live catalog wiring with named exceptions

**Status:** ready-for-agent

- [ ] `npm test` is green on current master after this ticket, including ticket 01’s wiring suite.
- [ ] Production scripts, styles, HTML, manifest, and locale files are unchanged.
- [ ] Engine tests reuse the source-extract helper from ticket 01 and the existing extract-and-run style (mocked `chrome` / `config` / tab snapshot). No second harness, browser runner, or new dependency.
- [ ] Exclusion: host-only patterns match that host with or without a trailing path.
- [ ] Exclusion: a pattern with a path matches that path and not an arbitrary deeper path unless a wildcard says so.
- [ ] Exclusion: a pattern with a scheme compares against scheme-bearing targets; a pattern without a scheme matches host and host-plus-path targets.
- [ ] Exclusion: `*` is “any characters”; other regex metacharacters stay literal; matching is case-insensitive.
- [ ] Exclusion: empty or whitespace-only patterns match nothing; a missing URL matches nothing; an invalid pattern fails closed (no match, no throw).
- [ ] Exclusion: trailing slashes on a pattern do not make an otherwise equal URL miss.
- [ ] Blacklist polarity: a match disables gestures; a non-match leaves them enabled.
- [ ] Whitelist polarity: a match enables gestures; a non-match disables them.
- [ ] Live lookup: a `direct` that exists under the draw-type action list resolves to that action config (for example default mouse-gesture `"L"` → Back).
- [ ] Live lookup: an unknown `direct` resolves to `{ name: null }` and does not throw or keep a previous action.
- [ ] Live lookup: a missing or empty action list for that draw type resolves to `{ name: null }`.
- [ ] Live lookup uses the nested lookup inside the service worker message handler (tip/action path). It must not lock unused `checkAction` / `config.mges.mges`.
- [ ] `getConfValue` returns the value whose `type` matches the requested key on the current action; a missing key returns an empty value rather than throwing.
- [ ] `getId` / `getIndex` use an in-memory current tab and window, not Chrome.
- [ ] `s_current`, `s_head`, `s_last` resolve to the current, first, and last tab (and the matching indexes).
- [ ] `s_left` / `s_right` resolve to the neighbour and wrap at the ends.
- [ ] `s_lefts` / `s_rights` resolve to the index range and to an empty list at the near edge.
- [ ] `s_others` is every tab except current, or an empty list in a one-tab window; `s_all` is every tab id; `s_default` is the sentinel `s_default`.
- [ ] Gesture direction encoding (`lineDraw`), stroke UI, timeout, `sendDir`, selected-text-to-URL detection, and per-action Chrome behaviour are not tested.
- [ ] Commit this slice only after `npm test` is green, using Conventional Commits with a body that records what was locked and that direction encoding was left out.
