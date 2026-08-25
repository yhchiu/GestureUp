# 03 — Gate the Node suite on push and pull request

**What to build:** Every push and pull request runs the same Node test command a contributor runs locally. The job uses Ubuntu and Node 22, does not pretend the package has installable dependencies, and fails the gate when any test fails. Because tickets 01 and 02 have already landed, the gate covers wiring, shared engines, and the existing injection suite together.

**Blocked by:** 01 — Lock live catalog wiring with named exceptions; 02 — Lock exclusion matching, action lookup, and tab targeting

**Status:** ready-for-agent

- [ ] A GitHub Actions workflow runs on push and on pull request.
- [ ] The job checks out the repo, uses Node 22 on Ubuntu, and runs the existing npm test script.
- [ ] There is no `npm install` (or equivalent) step; the package has no dependencies.
- [ ] The workflow fails when any Node test fails.
- [ ] The local Windows `npm test` invocation is unchanged.
- [ ] README and production files are unchanged.
- [ ] `npm test` is green locally before this slice is committed.
- [ ] Commit this slice only after the workflow file is in place and local tests are green, using a `ci:` Conventional Commit whose body states that the gate is the same command as local `npm test`.
