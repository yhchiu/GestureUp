# 01 — Lock live catalog wiring with named exceptions

**What to build:** Running the existing Node test command fails when a live catalog action is not wired through, and stays green on current master. A new catalog name without a background handler is a failure, except `paste`, which is documented as a content-script action (clipboard plus `actionPaste`) rather than a missing handler. Default-config action names must exist in the live catalog. Live names in the catalog apps group must have a matching inject file. Default-config version N must have a named upgrade step for every integer from 31 through N, including steps declared `async`. Live non-`none`, non-deprecated catalog names must have an English message key. Commented-out catalog names do not count as live. Extra handlers that are not in the catalog are allowed. Other locales may lag English. A shared source-extract helper exists for later tickets and is not itself a test.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `npm test` is green on current master after this ticket.
- [ ] Production scripts, styles, HTML, manifest, and locale files are unchanged.
- [ ] No new runtime or test-framework dependency; the test command is still the existing Node glob.
- [ ] A source-extract helper is available to later tickets, is not matched by the test glob, and cannot pass or fail the runner on its own.
- [ ] Catalog scans ignore comments, using the same comment-stripping idea as the existing injection suite.
- [ ] Every live catalog action name has a background handler, with a named exception list whose only handler exception is `paste`.
- [ ] The `paste` exception comment states that the service worker dispatches it to the content script via clipboard permission and `actionPaste`, not that it is unfinished.
- [ ] Handlers that are not in the live catalog (including notepad, shorturl, pxmovie, copylnkas, and the internal apps-save-config helper) do not fail the suite.
- [ ] Every action name that appears in default config is in the live catalog.
- [ ] Default-config option *values* are not locked (including the illegal `n_optype` token).
- [ ] Default-config version N has an upgrade function named for N, and a contiguous named step for each integer from 31 through N, including `async` steps.
- [ ] Upgrade *execution* from an old fixture is not tested; presence of the functions is enough.
- [ ] Every live name in the catalog apps group has a same-named inject file; inject files not in that group are allowed.
- [ ] Every live catalog name other than `none` and the deprecated group (`zoom_dep`, `restart`, `exit`) has an English message key.
- [ ] English locale JSON is parsed even if it starts with a BOM.
- [ ] Six-locale key-set equality is not asserted.
- [ ] Named exceptions are an explicit commented list, not skipped tests. A new hole not on the list fails.
- [ ] The existing Manifest V3 injection suite still passes and is not rewritten.
- [ ] Commit this slice only after `npm test` is green, using Conventional Commits with a body that records what was locked.
