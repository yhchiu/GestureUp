# 01 — Lock content-script config startup, fallback, and reload scheduling

**What to build:** A new Node suite that lifts the content script's config startup
state machine into the test harness and locks its observable behaviour. The suite
supplies the outside world itself — extension messaging, timers, the random source,
page storage, the document, and the listener-start call — so nothing depends on a
browser and nothing waits on a real clock. It locks the duplicate-load guard, the
retry count and its growing delay, the hard stop on an invalidated extension
context, the two-step fallback (cached config, then a minimal all-off config), the
one-notification-per-frame latch, the legacy page-storage backup key, the narrow
slice of config changes worth a reload, and the bounded jitter on reload
scheduling.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `npm test` is green after this ticket, including all existing suites.
- [ ] No production script, style, HTML, manifest, package, or locale file is
      changed by this ticket.
- [ ] No new runtime or test-framework dependency; the test command is still the
      existing Node glob.
- [ ] The suite reuses the shared source-extract helper. Any new extraction shape
      is added to that helper rather than duplicated in the test file.
- [ ] Timers are a hand-rolled fake clock injected into the harness as locals, and
      the test drains it. Node's global timers and the runner's own timers are not
      mocked.
- [ ] The random source used for reload jitter is supplied by the test, so the
      delay is asserted deterministically.
- [ ] A load already in flight does not start a second one.
- [ ] A load is not attempted at all when the extension context is already invalid.
- [ ] A successful response populates config, the top-level exclusion URL, the
      developer-mode flag, and the operating system.
- [ ] A successful response resets the retry count, marks startup initialised, and
      starts the gesture listeners.
- [ ] A response missing config, or missing the general section, is treated as a
      failure and not adopted.
- [ ] A runtime error on the config message is treated as a failure.
- [ ] An invalidated-context error stops retrying immediately, marks the context
      invalid, and notifies the user once.
- [ ] A retryable failure increments the retry count and schedules another attempt.
- [ ] Each retry's delay grows in proportion to the retry number.
- [ ] Retries stop at the configured maximum and then fall back.
- [ ] A valid cached config in page storage is adopted and starts the listeners,
      with no minimal config and no recovery notification.
- [ ] A cached config that cannot be parsed is ignored without throwing.
- [ ] A cached config without a general section is rejected.
- [ ] With no usable cache, a minimal config is installed with every gesture type
      switched off, exclusion left disabled, and timeout values left sane.
- [ ] The minimal-config path shows the recovery notification.
- [ ] At most one notification is shown per frame, whichever notification path
      fires first — both paths share one latch and that is the asserted contract.
- [ ] Notification markup is not asserted; only the latch is.
- [ ] The page-storage backup is written under the extension's pre-rename key, and
      a comment in the test records that renaming it would orphan every existing
      user's backup.
- [ ] A failed backup write (quota or blocked storage) is swallowed.
- [ ] A backup is written only when there is a config with a general section.
- [ ] A change to a watched section — the feature switches, exclusion, general
      settings, or the drag click-cancel setting — reports as worth a reload.
- [ ] A change to action or gesture mappings reports as not worth a reload.
- [ ] The nested local-storage shape and the flattened sync-storage shape both
      evaluate the watched sections correctly.
- [ ] The removal half of a clear-then-set is ignored.
- [ ] A storage change touching nothing watched reports as not worth a reload.
- [ ] Reload scheduling is inert before startup has succeeded once, and inert once
      the context is invalid.
- [ ] Scheduling a reload cancels the pending one rather than queueing a second.
- [ ] The scheduled delay falls inside the bounded jitter window, and the test
      records why the jitter exists: to stop every frame of every tab messaging the
      service worker in the same instant.
- [ ] The in-flight guard is cleared before a scheduled reload runs.
- [ ] The known invalidated-context defect described in the spec is neither fixed
      nor locked by a test in this ticket.
- [ ] Commit this slice only after `npm test` is green, using Conventional Commits
      with a body that records what was locked and what was left out.
