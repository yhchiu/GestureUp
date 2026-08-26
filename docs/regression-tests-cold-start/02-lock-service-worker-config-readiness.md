# 02 — Lock service-worker config readiness and the session cache

**What to build:** A new Node suite that locks the service worker's config
readiness with two seams, chosen per target. Message-listener gating and session
cache invalidation are anonymous listeners registered at module top level, so they
are locked by scanning source: every message listener must wait on the config-ready
promise before handling, must trigger a load if none has started, and must keep the
reply channel open. The config loader's session fast path is real behaviour, so it
is extracted and run against in-memory storage fakes: cache hit, cache miss, read
error, absent session storage, config already in memory, an explicitly named storage
type, both storage modes, the old flat local layout, and initialisation running
exactly once whichever path wins.

**Blocked by:** Ticket 01, only if that ticket adds a new extraction shape to the
shared helper that this suite also needs. Otherwise independent.

**Status:** ready-for-agent

- [ ] `npm test` is green after this ticket, including all existing suites.
- [ ] No production script, style, HTML, manifest, package, or locale file is
      changed by this ticket.
- [ ] No new runtime or test-framework dependency; the test command is still the
      existing Node glob.
- [ ] The suite reuses the shared source-extract helper, adding new extraction
      shapes to it rather than duplicating them.
- [ ] Source scans comment-strip first, the same way the existing suites do.
- [ ] Both the internal and the external message listener are asserted to wait on
      the config-ready promise before dispatching.
- [ ] Both listeners are asserted to fall back to starting a load when no load has
      started yet, rather than waiting on a promise that does not exist.
- [ ] Both listeners are asserted to keep the reply channel open, so the deferred
      reply still reaches the caller.
- [ ] The test comment records that this gating is what fixed the first
      simple-drag-after-idle doing nothing, so a future reader does not "simplify"
      it away.
- [ ] The session cache is asserted to be dropped when the authoritative store
      changes, for both the sync and the local area.
- [ ] A change to the session area itself is asserted not to drop the cache.
- [ ] The loader is extracted and run against in-memory session, sync, and local
      storage fakes plus an initialisation spy.
- [ ] A session-cache hit is adopted when config is not already in memory, and the
      authoritative stores are not read on that path.
- [ ] A session-cache entry without a general section is rejected.
- [ ] A session-cache miss falls through to the authoritative store.
- [ ] An error on the session read falls through to the authoritative store.
- [ ] A browser without session storage loads on the authoritative path without
      throwing.
- [ ] A load with config already in memory skips the fast path.
- [ ] A load that names a storage type explicitly skips the fast path.
- [ ] Initialisation runs exactly once regardless of which path produced the
      config.
- [ ] The loader returns the config-ready promise, and that promise resolves once
      config is populated.
- [ ] An unset sync preference is recorded as sync-on and then loads from sync
      storage.
- [ ] Sync-on reads sync storage; sync-off reads local storage.
- [ ] An empty sync store writes defaults and adopts them.
- [ ] An empty local store writes defaults under the nested config key and adopts
      them.
- [ ] The old flat local-storage layout is still read as config rather than reset.
- [ ] A browser without sync storage records the preference as off and uses local
      storage.
- [ ] Config is written to the session cache after a successful load, and a browser
      without session storage swallows that write.
- [ ] Per-action browser behaviour, config upgrade execution, and the options page
      are not touched by this suite.
- [ ] Commit this slice only after `npm test` is green, using Conventional Commits
      with a body that records which targets used which seam and why.
