# 03 — Lock manifest file references and align the package version

**What to build:** A new Node suite that reads the manifest as data and walks every
value that names a file. A literal path must exist on disk. A wildcard resource must
match at least one file. The default locale must have a messages file. The package
version must equal the manifest version, with the manifest as the source of truth.
This scan fails on current master, so this ticket also carries the only production
change in the whole slice: remove the web-accessible-resource entry naming a root
icon that the brand refresh deleted, and set the package version to the manifest
version. Nothing else in production may be touched.

**Blocked by:** None — can start immediately, independently of tickets 01 and 02.

**Status:** ready-for-agent

- [ ] `npm test` is green after this ticket, including all existing suites.
- [ ] The scan is data-driven over the manifest, not a hand-listed set of paths, so
      a new manifest key naming a file is covered without editing the test.
- [ ] Every literal file path the manifest names must exist: both icon sets, the
      service worker, every content script, the popup page, and the options page.
- [ ] A wildcard web-accessible resource must match at least one file.
- [ ] A literal web-accessible resource must exist — this is the assertion that
      catches the deleted root icon.
- [ ] The default locale named by the manifest must have a messages file.
- [ ] The package version must equal the manifest version.
- [ ] The manifest is the source of truth for the version; the test comment says so,
      so a future mismatch is fixed in the right direction.
- [ ] Production change, part one: the dead web-accessible-resource entry naming the
      deleted root icon is removed from the manifest. The rest of that entry — the
      wildcard image resource and the match pattern — is left exactly as it is.
- [ ] Production change, part two: the package version is set to the manifest
      version.
- [ ] No other production change is made. Not the permissions lists, not the
      minimum browser version, not the content-script registration, not any script,
      style, HTML, or locale file. If the scan surfaces a third inconsistency, it is
      written up rather than fixed here.
- [ ] The suite does not check script or stylesheet references inside HTML pages;
      that is a stated non-goal.
- [ ] No new runtime or test-framework dependency; the test command is still the
      existing Node glob.
- [ ] Commit this slice only after `npm test` is green, using Conventional Commits
      with a body that records both the new scan and the two production edits, and
      states that the edits were bounded to exactly those two.
