---
spine_type: CR
spine_version: 0.3.0
project: FLAG
slug: flag
cr_id: cr-001
doc_version: 0.4
status: Review
owner: slvdrvncntjvr
created: 2026-10-14
updated: 2026-10-14
reconciled: 2026-10-14
---

# Change Record 001: Audit repairs and durable authentication throttling

**Target doc:** build-flag.md, sdd-flag.md, qad-flag.md, ops-flag.md (status at time of CR: `Locked`)
**Requested by:** slvdrvncntjvr, 2026-10-14: "fix. or are there any decisions that needed from me? is it fixed?"

## 1. What changes

Preserve the existing removal of the retired prototype and the pending deployment/migration guidance, correct that guidance against observed deployment evidence, align the privacy notice with the already-approved PRD, bump the privacy and terms versions, fix atomic onboarding and missing-mail failures, strengthen relevant tests, and update compatible dependencies with security fixes. Product scope and all invariants stay unchanged.

One additional design decision needs approval: add AUTH_RATE_LIMIT to SDD §3 before a migration or code uses it. D1 enforces the existing approved sign-in/OTP cap of five attempts per fifteen minutes per IP+email across Worker instances; Cloudflare's burst binding alone cannot express a fifteen-minute period.

Proposed entity: AUTH_RATE_LIMIT has `key text PRIMARY KEY`, `count integer NOT NULL CHECK(count >= 1)`, and `expires_at integer NOT NULL` (Unix milliseconds), with an index on expires_at. Keys are domain-separated HMACs using BETTER_AUTH_SECRET over the trusted client IP, route, and normalized email for OTP routes; raw IP/email is never stored in this table. One conditional UPSERT atomically resets an expired bucket or increments a bucket below its cap; a full bucket cannot increment and returns 429 with a retry delay. Expired rows are deleted during auth requests. General auth limits also use this store; OTP limits use distinct route buckets so sending and verifying do not consume each other's allowance.

## 2. Why

The audit reproduced a role write on failed validation and success without any email provider. Cloudflare's version API showed a historical flag-dev version with production DB/auth bindings, while the active version was correctly isolated. The supplied build log showed deployment inside the build command followed by a separate deploy without the dev environment. Existing rate limits use isolate memory and differ from SDD §5. Existing public privacy copy still describes permanent retention and ID-derived data.

## 3. Before and after

| Aspect | Before | After |
|--------|--------|-------|
| CI | A build script also deploys; a subsequent default deploy can use production bindings | Explicit environment-specific build and deploy scripts; configuration validation before deployment |
| Onboarding | Role commits before all acknowledgments pass | Validate first; role and current acceptances commit atomically |
| Mail | A deployed OTP request succeeds without a provider | Fail outside actual localhost development; provider errors contain status only |
| Policy | Old scope and unchanged versions | Approved scope and new privacy/terms versions |
| Throttling (proposed) | Three/minute per IP/path, isolate memory | Five/fifteen minutes per IP+email, atomic D1 storage |
| Dependencies | Vulnerable transitive tool dependencies | Compatible available fixes; remaining advisories explicitly recorded |

## 4. Propagation

| Artifact | Kind | Change needed | Done |
|----------|------|---------------|------|
| build-flag.md | doc | Correct status, scripts, CI settings, security pins, retained prototype removal and migration guidance | yes |
| sdd-flag.md | doc | Add AUTH_RATE_LIMIT ERD/register/constraints; distinguish implemented auth/schema from future product features | yes |
| qad-flag.md | doc | Record actual automated coverage and auth/onboarding regression checks | yes |
| ops-flag.md | doc | Correct deploy/runbook guidance and required mail behavior | yes |
| index.md and log-flag.md | doc | Register this CR, record approval/recovery and unresolved external work | yes |
| web/package.json and web/package-lock.json | code | Separate build/deploy scripts and compatible security updates | yes |
| web/src/features/onboarding and web/src/server/db/queries/viewer.ts | code | Validate before an atomic commit; return recoverable errors | yes |
| web/src/server/auth and web/src/server/mail | code | Durable throttling after approval; reject missing mail; redact provider errors | yes |
| web/src/lib/policies.ts and web/src/app/(public)/legal | code | Align approved policy and require reacceptance | yes |
| web/src/server/db/schema.ts and web/drizzle | code | Add only the approved AUTH_RATE_LIMIT entity and migration | yes |
| web/tests and web/README.md | code/doc | Regression coverage and accurate setup instructions | yes |
| web/src/app/layout.tsx and web/public/font-licenses | code/assets | Keep the same faces, load pinned local font files after Google Fonts requests failed in build verification; distribute OFL licenses | yes |
| web/open-next.config.ts and web/scripts/check-ci-target.mjs | code | Reject mismatched CI environments and cross-branch production deployments before adapter operations; six Node regression checks | yes |
| web/wrangler.jsonc and web/scripts/check-wrangler-build.mjs | code | Run the same CI check before plain Wrangler uploads, since plain Wrangler can bypass adapter config | yes |

## 5. Risk

The new rate-limit migration must be applied to dev before a deployment that reads it, then to production before production release. The new policy versions require existing users to accept again. The Cloudflare build settings require access to the authenticated dashboard or an API token with Workers CI permission. No remote migration, code deployment, history restore, or checkpoint creation is included in this approval.

## 6. Approval

| Role | Who | Date | Decision |
|------|-----|------|----------|
| Owner | slvdrvncntjvr | 2026-10-14 | Approved CR-001 (recommended), including AUTH_RATE_LIMIT design, implementation, and locked-document propagation |
| Owner, dev release | slvdrvncntjvr | 2026-10-14 | Subsequently authorized: apply migration and deploy to dev; production excluded |
| Owner, dev push | slvdrvncntjvr | 2026-10-14 | Requested committing and pushing the changes to dev; production branch excluded |

The owner explicitly approved the concrete change record in this session. Implementation of the approved design is authorized while the amended documents are in Review. The subsequent dev-release instruction authorizes migration and deployment to dev; production remains excluded.

## 7. Verification and remaining release work

Local implementation is complete. On 2026-10-14, all 21 Workers-pool tests passed; lint and both app/test TypeScript checks passed; the full OpenNext dev Worker build passed with pinned local fonts. All four migrations applied to a fresh local D1. Drizzle regeneration reported no further schema changes. Deployment configuration checks accepted production/dev and rejected a CI name/environment mismatch. Normal SPINE validation passed and checkpoint verification was clean under this CR.

The security audit now reports five high entries from one braces advisory through ESLint, down from 17 total affected entries; no compatible patched release was available. Strict doc validation still flags three historical LOG marker strings, two deferred QR questions, and the pre-existing unchecked INDEX health item. Historical LOG rows were not rewritten; the QR work remains out of current implementation scope.

Dev released 2026-10-14 after the owner's explicit instruction: migration 0003_melted_the_twelve.sql applied to flag-db-dev; no remote dev migrations remain. npm run deploy:dev built and deployed flag-dev, version bd7b2957-e125-4dfe-a4ea-41c139510ca6. npm run verify:dev confirmed the active version's dev database and auth URL, seven anonymous routes (including protected redirects and noindex headers), privacy/terms version 2026-10-14, removal of permanent-retention copy, and invalid-code statuses 400/400/400/400/400/429 with a Retry-After header. No OTP was generated, no mail sent, and no account created by that check.

Not yet released to production: migration 0003 and audit code. Cloudflare dashboard build/deploy command corrections remain pending: Workers CI API permission is insufficient, and GUI navigation was unverified. No dashboard setting was saved. Changes were uncommitted at the initial dev release; the owner subsequently requested committing and pushing to dev. No production mutation, restore, or new checkpoint is included. The verifier is web/scripts/verify-dev-release.mjs and is available as npm run verify:dev.

Dev push preparation: origin/dev and local dev were aligned at 3582f7e. The owner requested the push. An additional CI branch/environment check runs when OpenNext config loads and in the guarded scripts, protecting against the still-unverified dashboard commands. Six Node tests cover the deployment boundary. The check is part of the approved cr-001 deployment repairs and changes no application behavior or product scope.

Push verification: six deployment tests, lint, app/test typechecks, normal docs validation, and checkpoint verification passed. Actual default Wrangler CI dry runs rejected flag and flag-dev from a dev commit before upload. A dev adapter build using the already-tested Next output and its deployment dry run passed with the correct DB/auth values; the selected environment reached the custom-build child correctly. No remote deployment occurred in these dry runs.
