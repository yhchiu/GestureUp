# Regression tests for action wiring and shared engines

Status: ready for implementation.

## Problem Statement

GestureUp is a Manifest V3 mouse-gesture extension. Contributors add and change actions, mini-apps, exclusion rules, and tab-target options in large, non-modular files with no build step. The repo already has a Node test suite that locks Manifest V3 script-injection shapes, but it does not lock the wiring of a new action into the catalog, handlers, inject files, English strings, or config-upgrade steps, and it does not lock the shared engines that turn a gesture string, exclusion pattern, or tab selector into a result. A missed handler or a silent change to those engines ships as a regression. There is no CI, so even the existing suite only runs if someone remembers to run it locally.

## Solution

Grow the existing Node test runner with two more suites that wrap current source and do not change production code. The first suite locks one-way wiring: a live catalog action must have a background handler (with one named exception), a default-config action must be in the catalog, an apps-group catalog name must have an inject file, a config-version bump must have a matching upgrade function for every step from 31 through the current default version, and a non-deprecated catalog action must have an English message key. The second suite locks the shared engines: exclusion pattern matching (including blacklist vs whitelist), the live gesture-to-action lookup, and the helpers that resolve action option values and tab/window targets. Known holes stay as named exceptions so current master stays green. GitHub Actions runs the full Node suite on every push and pull request.

## User Stories

1. As a contributor adding a new catalog action, I want the tests to fail if I forget a background handler, so that the action cannot appear in the options UI and then do nothing.

2. As a contributor adding a new catalog action, I want `paste` to remain a documented exception, so that I am not forced to invent a background handler for an action that is deliberately dispatched to the content script via clipboard and `actionPaste`.

3. As a contributor, I want the `paste` exception to state *why* it exists, so that a future reader does not treat it as unfinished work and “fix” it by adding a dead handler.

4. As a contributor deleting a dead background handler that is not in the catalog, I want the tests to stay green, so that one-way wiring does not freeze unused handlers in place.

5. As a contributor, I want extra handlers such as notepad, shorturl, pxmovie, copylnkas, and the internal apps-save-config helper to be allowed, so that commented-out or internal entry points are not treated as catalog holes.

6. As a contributor adding a default gesture that points at an action, I want the tests to fail if that action is not in the live catalog, so that a default config cannot name an action the options UI cannot edit.

7. As a contributor bumping the default config version to N, I want the tests to fail if there is no upgrade function named for N, so that existing users are not left on an older config schema.

8. As a contributor bumping the default config version to N, I want the tests to fail if any integer from 31 through N is missing an upgrade function, so that a hole in the chain cannot skip a migration.

9. As a contributor adding an upgrade function that is declared `async`, I want that function still to count as present, so that the wiring scan does not only see non-async upgrade steps.

10. As a contributor adding a mini-app to the catalog apps group, I want the tests to fail if there is no matching inject file, so that opening the app cannot request a script that does not exist.

11. As a contributor adding an inject file that is not in the live apps group, I want the tests to stay green, so that unused or commented-out mini-apps are not forced back into the catalog.

12. As a contributor adding a non-deprecated catalog action, I want the tests to fail if English messages lack a key for that action name, so that the UI does not show a raw identifier.

13. As a contributor, I want `none` to be excluded from the English-key requirement, so that the no-op catalog entry is not treated as a user-facing action name.

14. As a contributor, I want the deprecated group (`zoom_dep`, `restart`, `exit`) excluded from the English-key requirement, so that `exit` (which currently has no English key) does not fail the suite, and so that we do not take on a translation or production-string change in this work.

15. As a contributor adding strings to English messages, I want the tests *not* to require the same keys in Italian, Russian, Traditional Chinese, Simplified Chinese, or Brazilian Portuguese, so that translation lag is not a feature-regression failure.

16. As a contributor, I want a six-locale key-set snapshot *not* to be locked, so that completing a translation does not require editing a hundred-line exception list.

17. As a contributor editing comments in the action catalog, I want commented-out names such as lastlevel, mulisearch, gmail, notepad, and shorturl ignored, so that documentation in comments is not treated as a live catalog entry.

18. As a maintainer, I want the wiring suite green on current master with only the named exceptions above, so that the first run is a lock of today’s contract rather than a bug-fix ticket.

19. As a maintainer, I want named exceptions to be an explicit list with comments, not skipped tests, so that a new hole that is not on the list still fails.

20. As a contributor changing exclusion patterns, I want host-only patterns (no path, query, or hash) to match that host with or without a trailing path, so that `example.com` still excludes `https://example.com/foo`.

21. As a contributor changing exclusion patterns, I want a pattern with a path to match that path and not an arbitrary deeper path unless a wildcard says so, so that users can exclude a single route.

22. As a contributor changing exclusion patterns, I want a pattern with a scheme to compare against scheme-bearing targets, so that `http://` and `https://` exclusions do not silently collapse.

23. As a contributor changing exclusion patterns, I want a pattern without a scheme to match host and host-plus-path targets, so that users can write `example.com` instead of a full URL.

24. As a contributor changing exclusion patterns, I want `*` wildcards to translate to “any characters” and other regex metacharacters to stay literal, so that `example.com/foo*` is a glob and not a broken regex.

25. As a contributor changing exclusion patterns, I want matching to be case-insensitive, so that `Example.COM` still matches `example.com`.

26. As a contributor changing exclusion patterns, I want empty or whitespace-only patterns to match nothing, so that a blank blacklist row cannot disable the whole extension.

27. As a contributor changing exclusion patterns, I want a missing URL to match nothing, so that exclusion cannot throw when the tab URL is unavailable.

28. As a contributor changing exclusion patterns, I want an invalid pattern to fail closed (no match, no throw), so that one bad row cannot crash the content script.

29. As a contributor changing exclusion patterns, I want trailing slashes on a pattern not to make an otherwise equal URL miss, so that `example.com/` and `example.com` behave as users expect.

30. As a page user on a blacklisted URL with exclusion enabled and type black, I want gestures disabled, so that the blacklist actually excludes.

31. As a page user on a URL that is not in the blacklist with type black, I want gestures enabled, so that exclusion is opt-out, not opt-in.

32. As a page user on a whitelisted URL with exclusion enabled and type white, I want gestures enabled, so that the whitelist is the only place gestures run.

33. As a page user on a URL that is not in the whitelist with type white, I want gestures disabled, so that whitelist mode fails closed.

34. As a contributor changing gesture-to-action lookup, I want a `direct` string that exists under `config[drawType[0]][drawType[1]]` to resolve to that action config, so that “L” still means Back when that is how default mouse gestures are stored.

35. As a contributor changing gesture-to-action lookup, I want an unknown `direct` to resolve to a config whose name is null, so that a doodle that matches nothing does not throw and does not run a leftover previous action.

36. As a contributor changing gesture-to-action lookup, I want a missing or empty action list for that draw type to resolve to a config whose name is null, so that a not-yet-loaded config or an unknown draw type cannot drop the whole message handler.

37. As a contributor changing gesture-to-action lookup, I want that lookup tested on the live path used by tip and action messages, so that we do not lock the unused `checkAction` helper that still reads the old `config.mges.mges` key.

38. As a contributor changing how an action reads its options, I want `getConfValue` to return the value whose `type` matches the requested key in the current action’s selects/checks/texts/ranges, so that `n_tab` still means the tab selector the user configured.

39. As a contributor changing how an action reads its options, I want a missing key to return an empty value rather than throw, so that an older saved action without a newly added option does not crash the handler.

40. As a contributor changing tab targeting, I want `s_current` to resolve to the current tab id, so that “this tab” actions still hit the tab the gesture was drawn on.

41. As a contributor changing tab targeting, I want `s_head` to resolve to the first tab in the current window, so that “leftmost tab” is stable.

42. As a contributor changing tab targeting, I want `s_last` to resolve to the last tab in the current window, so that “rightmost tab” is stable.

43. As a contributor changing tab targeting, I want `s_left` on a middle tab to resolve to the previous tab, so that “tab to the left” is the neighbour.

44. As a contributor changing tab targeting, I want `s_left` on the first tab to wrap to the last tab, so that current wrap-around behaviour is preserved.

45. As a contributor changing tab targeting, I want `s_right` on a middle tab to resolve to the next tab, so that “tab to the right” is the neighbour.

46. As a contributor changing tab targeting, I want `s_right` on the last tab to wrap to the first tab, so that current wrap-around behaviour is preserved.

47. As a contributor changing tab targeting, I want `s_lefts` on a middle tab to resolve to every tab with a smaller index, so that “all tabs to the left” is a range.

48. As a contributor changing tab targeting, I want `s_lefts` on the first tab to resolve to an empty list, so that current “do nothing at the edge” behaviour is preserved.

49. As a contributor changing tab targeting, I want `s_rights` on a middle tab to resolve to every tab with a larger index, and on the last tab to resolve to an empty list, so that the right-hand range matches the left-hand range’s edge behaviour.

50. As a contributor changing tab targeting, I want `s_others` to resolve to every tab except the current one, and to an empty list when the window has a single tab, so that “other tabs” cannot include the current tab and cannot invent ids.

51. As a contributor changing tab targeting, I want `s_all` to resolve to every tab id in the current window, so that “all tabs” is exhaustive.

52. As a contributor changing tab targeting, I want `s_default` to resolve to the sentinel `s_default` rather than a tab id, so that callers that mean “browser default position” still see that token.

53. As a contributor changing tab index helpers, I want `getIndex` for `s_current`, `s_head`, `s_last`, `s_left`, `s_right`, and `s_default` to follow the same window snapshot as `getId`, so that “open to the left” and “act on the left tab” cannot drift apart.

54. As a contributor, I want engine tests to use a fake current tab and window snapshot rather than Chrome, so that they run in Node without a browser.

55. As a contributor, I want production JavaScript, HTML, CSS, and the manifest left unchanged, so that this work cannot itself regress the extension.

56. As a contributor, I want no new production module boundary, export, or build step, so that the extension remains a set of files the browser loads directly.

57. As a contributor, I want no new runtime or test-framework dependency, so that `npm test` remains `node --test` on the existing glob.

58. As a contributor, I want new tests to follow the existing extract-and-scan style, so that the repo does not grow a second kind of harness.

59. As a contributor, I want the existing Manifest V3 injection suite left behaviourally intact, so that already-locked injection, context-menu, and tab-snapshot bugs stay locked.

60. As a contributor, I want a shared source-extract helper used by the new suites and not registered as a test file, so that helper code cannot fail or pass the runner on its own.

61. As a contributor, I want gesture direction encoding (`lineDraw`, four-direction and eight-direction Simple Drag) out of this work, so that this slice does not stub UI, timeout, or message sending.

62. As a contributor, I want selected-text-to-URL detection out of this work, so that the engine suite stays on exclusion, lookup, and tab targeting.

63. As a contributor, I want the default-config `n_optype` value that is not a legal `s_*` token out of this work, so that we do not turn a known options-schema bug into a production fix.

64. As a contributor, I want per-action Chrome behaviour (close the right tabs, open a window, speak text) out of this work, so that we do not write eighty mocked Chrome APIs.

65. As a contributor, I want full config upgrade *execution* from an old version to the current default out of this work, so that we only lock that the upgrade functions exist, not that each historical migration still mutates a fixture correctly.

66. As a CI system, I want every push and pull request to run the Node test glob, so that a wiring or engine regression cannot merge untested.

67. As a CI system, I want to run on Ubuntu with Node 22 and without `npm install`, so that a lockfile-less, dependency-less package does not pretend it has a build.

68. As a maintainer, I want the workflow to fail when any Node test fails, so that the gate is the same command as local `npm test`.

69. As a maintainer, I want README and production comments left alone, so that this spec is not a documentation rewrite.

70. As an extension user, I want adding a mini-app or action in a future release not to silently skip inject, i18n, or upgrade wiring, so that gestures I already configured keep working.

71. As an extension user on a site I blacklisted, I want a future refactor of exclusion not to re-enable gestures on that host, so that my exclusion list remains trustworthy.

72. As an extension user whose gesture is “L” for Back, I want a future refactor of message handling not to look up the wrong config key, so that my existing gestures do not go dead.

73. As an extension user using “close tabs to the left”, I want a future refactor of tab targeting not to change wrap-around or empty-edge behaviour, so that the action I configured still means what it meant.

74. As a reviewer, I want three focused commits (wiring, engines, CI) after each slice’s tests pass, so that the history matches the two suites plus the gate.

75. As a reviewer, I want Conventional Commits with a body that records what was locked and what was explicitly excluded, so that a later reader does not assume direction encoding or upgrade execution were in scope.

76. As an implementing agent, I want current master green before and after the new files land, so that the named-exception policy is proven rather than hoped.

77. As an implementing agent, I want to treat source comments as blank when scanning catalogs and handlers, so that the same comment-stripping rules as the existing injection suite apply.

78. As an implementing agent, I want English messages parsed with a leading BOM stripped if present, so that locale JSON cannot fail the suite for a file-format quirk.

79. As a contributor running tests on Windows, I want the existing `node --test` glob in the package scripts to keep working, so that local and CI invocation stay one command.

80. As a future contributor about to change gesture recognition, I want this spec to say direction encoding was deferred on purpose, so that I know to add `lineDraw` tests in a later slice rather than assume they exist.

## Implementation Decisions

- Production code is frozen. Tests wrap the files the browser already loads. No new exports, no bundler, no test-only hooks in the service worker or content script.

- The action catalog in the options model is the source of live action names. Commented catalog entries are not live. The background action map is the source of handlers. Wiring is one-way: catalog names must exist as handlers, except `paste`.

- `paste` is not a missing handler. The service worker’s message switch handles it with clipboard permission and a content-script `actionPaste` message. The exception list must record that reason.

- Extra handlers that are not in the live catalog are allowed. They are not a second exception list; they are simply outside the one-way lock.

- Default config action names must be a subset of the live catalog. Option *values* inside default config (including the illegal `n_optype` token) are not locked in this slice.

- Default config version N requires an upgrade step named for N, and a contiguous chain of named steps from 31 through N. Presence is enough; running the migrations is not.

- Live names in the catalog apps group require a same-named inject file. Inject files that are not in the live apps group are allowed.

- English messages are the only locale locked, and only for live non-`none`, non-deprecated catalog names. Deprecated names are `zoom_dep`, `restart`, and `exit`. Other locales may lag.

- Shared engines to lock: exclusion pattern matching and blacklist/whitelist polarity; the live gesture-to-action lookup used when the content script asks for a tip or an action; option-value lookup on the current action; tab id and tab index resolution from the current window snapshot.

- Gesture-to-action lookup must use the live nested lookup inside the service worker message handler (the path that reads `config[drawType[0]][drawType[1]]` by `direct`). The unused helper that still iterates `config.mges.mges` must not be the seam, because locking it would green-light a corpse.

- Tab targeting tests use an in-memory current tab and current window. They lock today’s edge behaviour: wrap on single-step left/right, empty list on range-at-edge, empty others in a one-tab window, `s_default` as a sentinel.

- Exclusion tests drive the content-script exclusion helpers with provided URLs and patterns. Black means “match disables”; white means “match enables, non-match disables”. Invalid patterns fail closed.

- New Node test files are added next to the existing suite. A source-extract helper may be shared by the new files but must not match the test glob. The existing injection suite is not rewritten in this slice.

- CI is a GitHub Actions workflow on push and pull request, Ubuntu, Node 22, running the existing npm test script with no install step.

- Commits are three Conventional Commit slices: wiring tests, engine tests, then CI. Each slice is committed only after `npm test` is green.

## Testing Decisions

A good test in this repo asserts a contract the extension can break without TypeScript or a bundler noticing. It does not assert the internals of one action handler (how `close` walks Chrome’s tab API). It does assert the *junctions* between parts: catalog to handler, catalog to inject file, catalog to English name, version to upgrade step, pattern to match, direct string to action config, selector token to tab ids. Those junctions are the external behaviour of an unmodular extension.

Prefer existing seams. Do not add production seams.

- **Seam 1 — source as data (highest, already used).** Read catalog source, service worker source, inject filenames, English messages, and default-config version the same way the existing injection suite scans script-injection keys and context-menu `id`s. Comment-strip before scanning. This is the wiring suite.

- **Seam 2 — extract and run (already used).** Lift exclusion helpers, the live lookup path, and `getConfValue` / `getId` / `getIndex` into a Node harness with mocked `chrome` / `config` / tab snapshot, the same way the existing suite lifts `insertTest`, `CTMclick`, and `initBox`. This is the engine suite.

Those two seams are enough. Do not add a browser extension runner, jsdom options-page harness, or Playwright unpacked-extension session.

Prior art: the existing Node suite under the test directory, which already comment-strips source, extracts methods, mocks `chrome.scripting`, and fails loud when a helper cannot be extracted.

Modules under test: the action catalog, the background action map, the inject-app file set, English messages, default config version and upgrade function names, content-script exclusion matching, the live message-handler lookup from draw type plus direct string to action config, and the tab-target helpers. Not tested: individual action Chrome calls, gesture direction encoding, selected-text URL detection, options-page UI, locale completeness beyond English catalog keys, and executing historical upgrades.

Master must stay green. The only named wiring exception is `paste` (plus the documented exclusions of `none` and the deprecated group from the English-key rule). New holes not on that list fail.

## Out of Scope

- Changing any production script, style, HTML, manifest, or locale file
- Extracting modules or adding exports so that production code can be imported
- Adding npm dependencies, a bundler, coverage gates, or a second test runner
- Rewriting the existing Manifest V3 injection tests
- Browser / Playwright / Puppeteer end-to-end tests
- Per-action behaviour against `chrome.tabs`, windows, TTS, downloads, or clipboard
- Gesture direction encoding (`lineDraw`), stroke UI, gesture timeout, and `sendDir`
- Selected-text-to-URL detection
- Default-config option-value validity (including `n_optype: "n_new"`)
- Executing config upgrade functions from an old fixture to the current version
- Six-locale message-key equality or translation backfill
- README or changelog edits
- Fixing `paste`, `exit` i18n, extra unused handlers, or the unused `checkAction` helper

## Further Notes

This spec is the written form of a grilling session that locked: regression insurance as the goal; grow the existing Node suite; no production changes for testability; wiring first, then shared engines; green master with named exceptions; GitHub Actions as the gate; locale *parity* dropped because Italian, Russian, and Traditional Chinese lag English by more than a hundred keys; direction encoding deferred because it is half UI.

Suggested layout (implementer detail, not a production API): source-extract helper that does not match `*.test.js`; a wiring test file; an engines test file; a GitHub Actions workflow that checks out the repo, sets up Node 22, and runs `npm test`.

Suggested commits:

1. `test: lock action catalog wiring across handlers, inject files, and upgrades`
2. `test: cover exclusion matching, action lookup, and tab target helpers`
3. `ci: run npm test on push and pull requests`

Do not implement until this spec is the agreed source of truth for the work. If a later slice takes on `lineDraw`, per-action Chrome mocks, or upgrade execution, write a new spec; do not stretch this one.
