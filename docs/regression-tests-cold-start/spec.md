# Regression tests for config startup and manifest consistency

Status: ready for implementation.

This is the second regression-test slice. The first slice (action wiring, shared
engines, CI) lives in its own docs directory and is complete. This spec does not
extend that one; it takes a different pair of risk areas and leaves that spec's
scope untouched.

## Problem Statement

GestureUp is a Manifest V3 mouse-gesture extension with no build step and no
modules. Its Node test suite now locks script injection, action-catalog wiring,
exclusion matching, gesture-to-action lookup, and tab targeting. Two areas that
the project has repeatedly had to fix are still completely untested.

The first is config startup. A Manifest V3 service worker is torn down when idle
and restarted on the next event, and a content script runs in every frame of
every tab. Getting config into both of them has been fixed six separate times:
the first drag after an idle period doing nothing, a null config read, a session
cache added for cold starts, globals that did not exist under a service worker, a
retry added to direction sending, and a whole retry-with-fallback loader added to
the content script. Every one of those fixes shipped without a test. When this
area breaks, the user does not see a subtle bug — every gesture stops working.

The second is manifest consistency. The manifest names files, and files get
renamed and deleted. This has already gone wrong and is still wrong today: the
brand refresh deleted a root-level icon that the manifest still lists as a
web-accessible resource, and the extension version has been bumped in the manifest
while the package file was left behind. Nothing in the repo notices.

By contrast, the script-injection area — eight fixes, the largest cluster in the
project's history — is now the safest part of the codebase, because every one of
those eight fixes arrived with a test. The habit works. It has simply never been
applied to config startup or to the manifest.

## Solution

Add two more Node suites to the existing runner and one narrow production fix.

The first suite locks the content script's config startup: a duplicate-load guard,
a retry count with a growing delay, a hard stop on an invalidated extension
context, a fallback to a cached config, a minimal all-gestures-off config when
even that is unavailable, a single user-facing notification per frame, the narrow
set of storage changes that are worth a reload, and jittered reload scheduling so
that many frames do not stampede at once.

The second suite locks the service worker's config readiness: message handlers
waiting on a config-ready promise before they run, the session-storage fast path
used when the worker has just been revived, the fall back to authoritative storage
on a miss or on an older browser, one-time initialisation whichever path wins, and
dropping the session cache when the authoritative store changes.

The third piece is a static scan of the manifest: every file path the manifest
names must exist, and the package version must equal the manifest version. That
scan fails on current master, so this spec also carries the two-line production fix
that makes it pass — removing the dead resource entry and aligning the package
version. That is the only production change permitted.

Production code is otherwise frozen. Tests wrap the files the browser already
loads, using the extract-and-scan harness the existing suites established.

## User Stories

### Content-script config startup

1. As an extension user opening a page, I want the content script to ask the
   service worker for config exactly once per attempt, so that a slow reply does
   not cause a second overlapping request.

2. As an extension user on a page whose extension context is already invalid, I
   want the content script not to attempt a config load at all, so that a doomed
   request does not produce a console error on every page.

3. As an extension user, I want a successful config response to populate the
   config, the top-level tab URL used for exclusion, the developer-mode flag, and
   the operating system, so that exclusion and platform-specific behaviour work on
   the first gesture.

4. As an extension user, I want a successful load to reset the retry counter, so
   that a later unrelated failure gets a full set of retries rather than
   inheriting an old count.

5. As an extension user, I want a successful load to mark startup as initialised,
   so that later storage changes are allowed to schedule a reload.

6. As an extension user, I want a successful load to start the gesture listeners,
   so that config arriving is what makes gestures live.

7. As an extension user, I want a reply that is missing config, or missing the
   general section of config, to be treated as a failure rather than accepted, so
   that a half-built config cannot half-enable the extension.

8. As an extension user, I want a runtime error on the config message to be
   treated as a failure, so that a dropped message is retried rather than silently
   ignored.

9. As an extension user who has just reloaded the extension from the extensions
   page, I want an invalidated-context error to stop retrying immediately, so that
   an already-dead frame does not spend three retries failing.

10. As an extension user, I want an invalidated context to mark the context
    invalid and show the user one notification, so that the page tells me to
    reload rather than appearing to work.

11. As an extension user on a flaky startup, I want a retryable failure to
    increment the retry count and schedule another attempt, so that a transient
    service-worker wake-up does not cost me my gestures.

12. As an extension user, I want each retry to wait longer than the last, in
    proportion to the retry number, so that a service worker that is still
    starting is not hammered.

13. As an extension user, I want retries to stop at the configured maximum, so
    that a permanently broken context does not retry forever.

14. As an extension user, I want the final failure to fall back rather than give
    up silently, so that the page is left in a defined state.

15. As an extension user whose config was cached in page storage, I want the
    fallback to use that cached config and start the listeners, so that my own
    settings survive a service-worker failure.

16. As an extension user, I want a cached config that cannot be parsed to be
    ignored rather than thrown, so that a corrupt backup cannot break the page.

17. As an extension user, I want a cached config without a general section to be
    rejected, so that the same completeness rule applies to the cache and to the
    live response.

18. As an extension user with no usable cache, I want a minimal config to be
    installed with every gesture type switched off, so that the content script can
    run without throwing while doing nothing surprising.

19. As an extension user on the minimal config, I want exclusion left disabled and
    the gesture-timeout values left sane, so that the fallback cannot accidentally
    disable the extension on some sites and not others.

20. As an extension user on the minimal config, I want a recovery notification
    shown, so that I know to reload rather than assuming the extension is broken
    forever.

21. As an extension user with many frames on a page, I want at most one
    notification per frame regardless of which failure path fires first, so that a
    framed page does not stack a wall of banners.

22. As an extension user, I want the config backup written to page storage under
    the key the extension has always used, so that a rename does not orphan every
    existing user's backup.

23. As an extension user with page storage full or blocked, I want a failed backup
    write to be swallowed, so that a storage quota error cannot break gestures.

24. As an extension user, I want a backup written only when there is a real config
    with a general section, so that the fallback cannot cache an empty object over
    a good backup.

25. As an extension user who changes a setting that affects listener attachment or
    exclusion, I want the content script to notice and reload its config, so that
    the change takes effect without a page reload.

26. As an extension user who changes only an action or gesture mapping, I want the
    content script not to reload, so that editing gestures does not churn every
    open frame; those mappings are resolved in the background at gesture time.

27. As an extension user on local storage mode, I want a change to the single
    nested config key to be evaluated on its new value, so that the watched
    sections are compared correctly.

28. As an extension user whose settings are being saved, I want the removal half of
    a clear-then-set to be ignored, so that a save does not trigger a reload on a
    config that is about to be replaced anyway.

29. As an extension user on sync storage mode, I want changes to the flattened
    top-level keys to be evaluated the same way as the nested form, so that sync
    and local users get identical reload behaviour.

30. As an extension user, I want a storage change that touches nothing watched to
    produce no reload, so that unrelated writes are free.

31. As an extension user, I want reload scheduling to do nothing before startup has
    succeeded once, so that a storage change during startup cannot race the initial
    load.

32. As an extension user, I want reload scheduling to do nothing once the context
    is invalid, so that a dead frame does not schedule work.

33. As an extension user with thousands of tabs open, I want each frame's reload to
    be delayed by a random offset within a bounded window, so that one save does
    not make every frame message the service worker in the same instant.

34. As an extension user, I want a newly scheduled reload to cancel the pending
    one, so that a burst of storage changes results in one reload, not a queue.

35. As an extension user, I want the in-flight guard cleared before a scheduled
    reload runs, so that a reload after a stuck request is not blocked by the
    guard.

### Service-worker config readiness

36. As an extension user drawing the first gesture after an idle period, I want the
    message handler to wait for config before running, so that the gesture is not
    dropped by a worker that is still loading.

37. As an extension user, I want both the internal and external message listeners
    to wait the same way, so that content-script and page-injected messages have
    the same guarantee.

38. As an extension user, I want the message listeners to keep the reply channel
    open while waiting, so that the deferred reply still reaches the caller.

39. As an extension user, I want a message that arrives before any load has started
    to trigger a load rather than wait forever, so that the very first event after
    install is handled.

40. As an extension user whose service worker was just revived, I want config read
    from the session cache when it is available, so that the cold-start window is
    as short as possible.

41. As an extension user, I want the session cache used only when config is not
    already in memory, so that a save-triggered reload reads the authoritative
    store rather than the stale cache.

42. As an extension user, I want a session-cache entry without a general section to
    be rejected, so that a truncated cache cannot be adopted as config.

43. As an extension user, I want a session-cache miss to fall through to the
    authoritative store, so that the fast path is an optimisation and never a
    requirement.

44. As an extension user, I want an error on the session read to fall through to
    the authoritative store, so that a storage failure degrades to slow rather than
    broken.

45. As an extension user on a browser without session storage, I want the load to
    proceed on the authoritative path without throwing, so that the minimum
    supported browser still starts.

46. As an extension user, I want a load that names a specific storage type to skip
    the fast path entirely, so that an explicit reload after a save is always
    authoritative.

47. As an extension user, I want initialisation to run exactly once no matter which
    path produced the config, so that listeners and menus are not built twice.

48. As an extension user, I want the config-ready promise resolved once config is
    populated, so that every handler waiting on it is released together.

49. As an extension user, I want the loader to hand back the config-ready promise,
    so that a caller that triggered the load can await the same signal.

50. As a first-time extension user, I want an unset sync preference to be recorded
    as sync-on and then loaded from sync storage, so that a fresh install has a
    defined storage mode.

51. As an extension user with sync on, I want config read from sync storage, and
    with sync off, from local storage, so that the preference is honoured.

52. As an extension user with an empty sync store, I want defaults written and
    adopted, so that a new profile has a usable config.

53. As an extension user upgrading from an old local-storage layout, I want the old
    flat shape still read as config, so that a long-standing install is not reset.

54. As an extension user with an empty local store, I want defaults written under
    the nested config key and adopted, so that local mode has the same first-run
    guarantee as sync mode.

55. As an extension user on a browser without sync storage, I want the sync
    preference recorded as off and local storage used, so that the loader does not
    depend on an optional API.

56. As an extension user, I want config written to the session cache after a
    successful load, so that the next worker revival is fast.

57. As an extension user on a browser without session storage, I want the cache
    write to be swallowed, so that caching cannot break loading.

58. As an extension user who saves settings, I want the session cache dropped, so
    that the next worker start reads my new settings and not the old cache.

59. As an extension user whose settings arrive from another device, I want the
    session cache dropped on that sync write too, so that a remote change is not
    masked by a local cache.

60. As an extension user, I want a write to the session area itself not to drop the
    cache, so that caching does not invalidate itself in a loop.

### Manifest and version consistency

61. As an extension user installing a release, I want every file the manifest names
    to exist in the package, so that the browser does not reject the extension or
    silently drop a resource.

62. As a contributor deleting or renaming an asset, I want the tests to fail if the
    manifest still names it, so that the failure happens on my machine rather than
    in a store review.

63. As a contributor, I want the icon sets, the service worker, the content
    scripts, the popup page, and the options page all covered by that check, so
    that no manifest path is exempt.

64. As a contributor, I want a wildcard resource entry to require at least one
    matching file, so that an emptied directory is still caught without the check
    having to enumerate globs exactly.

65. As a contributor, I want a literal resource entry to require that exact file, so
    that the resource entry naming a root icon deleted during the brand refresh is
    caught.

66. As a contributor, I want the default locale to have a messages file, so that the
    manifest's translated name and description resolve.

67. As a release manager, I want the package version to equal the manifest version,
    so that the two cannot drift as they have.

68. As a release manager, I want the manifest treated as the source of truth for the
    version, so that there is one obvious direction to fix a mismatch.

69. As a maintainer, I want this slice to remove the dead resource entry and align
    the package version, so that the new scan is green rather than permanently
    excepted.

70. As a maintainer, I want that fix bounded to exactly those two changes, so that a
    consistency scan does not become a licence to edit production behaviour.

### Suite-level

71. As a contributor, I want these tests to run under the existing test command with
    no new dependency, so that local and CI invocation stay identical.

72. As a contributor, I want the new suites to use the existing extract-and-scan
    harness, so that the repo does not grow a second style of test.

73. As a contributor, I want timers, randomness, page storage, the document, and the
    browser APIs supplied by the test rather than taken from the environment, so
    that the retry and jitter behaviour is asserted deterministically and in
    milliseconds rather than seconds.

74. As a contributor, I want no production script, style, HTML, or locale file
    changed beyond the two named manifest and package edits, so that this work
    cannot itself regress the extension.

75. As a contributor, I want the existing suites left behaviourally intact, so that
    everything already locked stays locked.

76. As a maintainer, I want the full suite green after this work, so that the gate
    stays meaningful.

77. As a reviewer, I want three focused commits matching the three tickets, so that
    the history matches the two suites plus the manifest scan and its fix.

78. As a future contributor, I want the spec to record which risk areas were
    deliberately left out and why, so that a later reader does not assume they were
    forgotten.

## Implementation Decisions

- Production code is frozen apart from two edits carried by the manifest ticket:
  removing the web-accessible-resource entry naming a root icon that no longer
  exists, and setting the package version equal to the manifest version. No other
  production change is in scope, and neither edit may be widened into a behavioural
  change.

- The manifest is the source of truth for the extension version. The package file
  follows it.

- The content-script startup state machine is the unit under test for the first
  suite. Its observable contract is: the in-flight guard, the retry count, the
  growing delay per retry, the hard stop on an invalidated context, the fallback
  order (cached config, then minimal config), the single-notification latch shared
  by both notification paths, the page-storage backup key, the watched slice of
  config that justifies a reload, and the bounded random reload delay.

- The startup state machine's dependencies are supplied by the harness, not by the
  environment: the extension messaging call, timers, the random source, page
  storage, the document, and the listener-start call. Timers are a hand-rolled fake
  clock injected as locals into the harness, drained by the test. The runner's own
  global timers are not mocked.

- The notification paths are asserted only for the latch — at most one banner per
  frame, whichever path fires first. Their markup is not asserted; it is
  presentation and will change.

- The page-storage backup key keeps its pre-rename name. That name is locked
  deliberately, with a comment, because renaming it would orphan the backup of
  every existing install.

- Reload scheduling is asserted as: inert before first successful startup, inert
  once the context is invalid, coalescing (a new schedule cancels the pending one),
  clearing the in-flight guard before reloading, and producing a delay inside its
  bounded jitter window. The exact random value is supplied by the harness.

- The service-worker readiness work uses two seams, chosen per target rather than
  uniformly. The message-listener gating and the cache invalidation are anonymous
  listeners registered at module top level; they are locked by scanning source,
  because what regressed there was structural — whether the listener waits at all
  and whether it keeps the reply channel open. The loader's session fast path is
  locked by extracting and running it, because what regressed there was
  behavioural — which store answers, what happens on a miss, and how many times
  initialisation runs.

- The loader is exercised with in-memory fakes for session, sync, and local
  storage, plus a spy for initialisation. Assertions cover the fast path, the miss,
  the read error, the absent-session-storage browser, the already-loaded case, the
  explicit-storage-type case, the first-run sync preference, both storage modes, the
  old flat local layout, and once-only initialisation.

- The manifest scan reads the manifest as data and walks every value that is a file
  path. A literal path must exist. A wildcard resource must match at least one file.
  The default locale must have a messages file. The scan is data-driven over the
  manifest rather than a hand-listed set of paths, so a new manifest key naming a
  file is covered without editing the test.

- No new production module boundary, export, test-only hook, bundler, runtime
  dependency, or test framework. The test command stays the existing Node glob.

- The shared source-extract helper from the first slice is reused. If these suites
  need a new extraction shape, it is added to that helper, not duplicated.

- Three Conventional Commit slices, in ticket order, each committed only after the
  full suite is green.

## Testing Decisions

A good test here asserts a contract the extension can break without a compiler or a
bundler noticing, and asserts it from outside the unit. It does not assert how the
retry loop is written, what the notification markup contains, or which private
variable holds the timer. It does assert what an extension user or a contributor
would observe: that a failed load is retried a bounded number of times with a
growing wait, that an invalidated context stops immediately, that a frame shows at
most one banner, that a save drops the stale cache, that the first gesture after an
idle period is not dropped, and that the manifest never names a file that is not
there.

Prefer existing seams. Do not add production seams.

- **Seam 1 — source as data.** Read the manifest as data and the service worker as
  text, the way the existing suites scan injection call shapes and context-menu ids.
  Used for the manifest scan and for the listener gating and cache invalidation,
  which are anonymous module-level registrations with no other seam.

- **Seam 2 — extract and run.** Lift the startup state machine and the config loader
  into the Node harness with supplied timers, randomness, storage, document, and
  messaging, the way the existing suites lift the exclusion helpers, the gesture
  lookup, and the tab-target helpers.

Those two seams are enough. No browser runner, no DOM library, no unpacked-extension
session.

Prior art: the existing Node suites, which already comment-strip source, extract
functions and object methods, run them against hand-built fakes, and fail loudly
when an extraction target cannot be found. The fake-clock technique is new to the
repo but follows the same principle the existing suites already use — the test
supplies the outside world as plain objects.

Modules under test: the content-script config startup state machine including its
fallback and reload scheduling; the service-worker config loader including its
session fast path and one-time initialisation; the service-worker message-listener
readiness gating and session-cache invalidation; and the manifest as a set of file
references.

Not tested: gesture direction encoding, selected-text URL detection, per-action
browser behaviour, config upgrade execution, the options page, locale parity, and
anything already covered by the first slice.

The suite must be green after this work. Unlike the first slice, this one is not
expected to need a named-exception list: the one known failure it produces is fixed
rather than excepted.

## Out of Scope

- Any production change other than removing the dead web-accessible-resource entry
  and aligning the package version
- Extracting modules, adding exports, or adding test-only hooks
- Adding dependencies, a bundler, a coverage gate, or a second test runner
- A coverage percentage or coverage threshold of any kind
- Rewriting or restructuring the existing suites
- Browser, Playwright, or Puppeteer end-to-end tests
- Checking script and stylesheet references inside HTML pages
- Locale key parity or translation backfill
- Gesture direction encoding, stroke UI, gesture timeout, and direction sending
- Selected-text-to-URL detection
- Per-action behaviour against tabs, windows, text-to-speech, downloads, or the
  clipboard
- Config upgrade execution
- Fixing the invalidated-context message handling described in Further Notes
- README or changelog edits

## Further Notes

This spec is the written form of a grilling session. The decisions it locked, in
order: the goal is regression insurance rather than a coverage number; the risk
ranking comes from bug history rather than a whole-file audit; production stays
frozen and any target that the freeze cannot reach is dropped rather than unlocked;
three tickets rather than two, because the two config areas need different fakes;
and a real fix rather than a permanent exception for the one failure the manifest
scan produces.

**Why no coverage percentage.** The suites execute source fragments extracted as
text, not the files themselves, so a line-coverage run would report near zero for
the production scripts no matter how much is genuinely locked. The denominator is
also dominated by vendored libraries — a sanitiser, a QR encoder, an MD5
implementation, and a drag-and-drop library together account for roughly a quarter
of the repo's JavaScript and are not ours to test. A percentage here would be a
false signal in both directions. The seam table below is the auditable substitute.

**Seam table — what is locked and what is not.** Fix counts are from the project's
own history; this is the ranking that produced this spec's scope.

| Risk area | Fixes in history | Status |
| --- | --- | --- |
| Script injection and mini-app lifecycle | 8 | Locked. Every fix shipped with a test. |
| Config startup and readiness | 6 | This spec, tickets 01 and 02. |
| Manifest, version, and asset drift | 6 | This spec, ticket 03. Currently broken. |
| Locale file churn | 4 | English catalog keys only. Deliberately not extended. |
| Exclusion matching | 3 | Locked by the first slice. |
| Action catalog wiring | — | Locked by the first slice. |
| Gesture-to-action lookup, tab targeting | — | Locked by the first slice. |
| Gesture direction encoding | 0 | Not locked. Half UI; deferred by the first slice and still deferred. |
| Selected-text URL detection | 1 | Not locked. |
| Per-action browser behaviour | — | Not locked. Would need many mocked browser APIs. |
| Config upgrade execution | — | Presence of upgrade steps is locked; running them is not. |
| Options page UI | — | Not locked. |

Locale parity was dropped again for the same reason as the first slice, plus a new
one: the commit that edited all six locale files at once never caused a defect.

**A known defect this work deliberately does not fix.** The content script's error
handler is called with the browser's last-error message and immediately calls a
string method on it. When the browser reports an error without a message, that call
throws and takes the whole retry chain with it. This was found while writing this
spec. It is not fixed here, because this slice's production edits are bounded to the
manifest and package files. It is also not locked by a test: a test that asserts
today's throwing behaviour would turn green into red the day someone fixes it, and a
permanently-skipped test is noise the first slice already ruled out. It belongs in a
later slice, together with the other content-script hardening work.

Suggested layout (implementer detail, not a production API): one test file for
content-script startup, one for service-worker readiness, one for manifest
consistency, plus whatever extraction shapes the shared helper still lacks.

Suggested commits:

1. `test: lock content-script config startup, fallback, and reload scheduling`
2. `test: lock service-worker config readiness and session cache`
3. `test: lock manifest file references and align the package version`

Do not implement until this spec is the agreed source of truth. If a later slice
takes on direction encoding, per-action browser behaviour, upgrade execution, or the
invalidated-context defect above, write a new spec; do not stretch this one.
