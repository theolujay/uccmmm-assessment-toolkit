# Presentation release briefing

## 1. Deployment: Vercel + staging Supabase

[Vercel](https://vercel.com/docs/frameworks/frontend/vite) is the recommended first deployment because `vercel.json` already defines the build, output directory, and SPA rewrite. Vercel hosts the static web app; Supabase provides authentication, Postgres, and Edge Functions. No separate Node or NestJS server is needed. Use fictional data only in the presentation environment.

1. **Prepare the release revision.** Run the [verification commands](README.md#verify-a-change) with Node 24 and the pinned pnpm version, then identify which revision you will deploy. Research artefacts are not needed by the app and are excluded from CLI uploads by `.vercelignore`; review them separately before sharing the repository.
2. **Create a dedicated Supabase staging project.** From the repo root, link the staging project, preview with `supabase db push --remote --dry-run`, apply with `supabase db push --remote`, and deploy the `invite-stakeholder` and `manage-stakeholder` functions. This applies the existing evidence and maturity-target migrations. See [SETUP.md](SETUP.md#6-connect-a-supabase-project) for commands and Resend setup. Auth signup/reset emails use Supabase Auth's email configuration; stakeholder invitation emails use the Edge Functions and Resend. Verify mail delivery for both, or prepare the accounts in advance.
3. **Import the repo in Vercel.** Use the **repository root**, not `apps/web`, so the build sees the pnpm workspace and shared contracts. Select **Node.js 24.x**. The checked-in Vite configuration uses `pnpm build` and publishes `apps/web/dist`; no dashboard overrides are needed for those. Set `ENABLE_EXPERIMENTAL_COREPACK=1` to use the pnpm version pinned in the root `package.json`. Verify the Node and pnpm versions in the first build log.
4. **Set the frontend build variables.** Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel environment you will present from. The latter can be a Supabase publishable key or legacy anon key; the variable name stays the same. Do not add the Supabase secret/service-role key or Resend API key to Vercel's frontend variables. Keep `VITE_DEMO_MODE` off for staging. Redeploy after changing any `VITE_` value.
5. **Use one stable HTTPS URL.** Set this URL as the Supabase Auth Site URL and allow the exact `/reset-password` URL. Set `APP_BASE_URL` and `APP_ORIGIN` to the deployed URL and its origin in your Supabase Edge Function secrets. Apply the appropriate access controls for who needs to see the demo. In a fresh browser profile, verify sign-in, direct refresh on `/assessment` and `/reports`, and that `/sw.js` serves JavaScript rather than the HTML shell.

**Cloudflare Pages alternative:** Use the same repo root, `pnpm build`, `apps/web/dist`, Node/pnpm versions, and frontend variables. Pages [serves SPAs natively](https://developers.cloudflare.com/pages/configuration/serving-pages/#single-page-application-spa-rendering) when the output has no top-level `404.html`. `vercel.json` does not apply there. You can also build locally with the staging build variables and upload `apps/web/dist` as a Pages Direct Upload. Supabase setup and the smoke test are the same either way.

## 2. Repeatable staging demo

**One-time setup:** Register and confirm a staging Admin using the exact organisation name **`Fictional Staging Demo - Paper Moon ERP`**. Use fictional profile details. Do not open an assessment on this fresh account before seeding: submitting the example baseline would clear the active draft slot, so the script refuses to seed a missing baseline over an existing draft. Keep this Admin signed out of the web app on all devices while the seeder runs; do not edit the organisation concurrently.

In the ignored `apps/web/.env.demo.local`, set the following. These values are for the local seeder, not Vercel. Do not share or commit the demo password.

```dotenv
UCCMMM_DEMO_URL=https://YOUR_PROJECT_REF.supabase.co
UCCMMM_DEMO_PUBLIC_KEY=YOUR_STAGING_PUBLISHABLE_OR_ANON_KEY
UCCMMM_DEMO_EMAIL=YOUR_STAGING_ADMIN_EMAIL
UCCMMM_DEMO_PASSWORD=YOUR_STAGING_ADMIN_PASSWORD
```

From the repo root:

```sh
pnpm --filter @assessment/web demo:seed
pnpm --filter @assessment/web demo:seed --write https://YOUR_PROJECT_REF.supabase.co
```

The first command only validates and previews the fixture. The second requires the exact hosted staging Supabase URL with no trailing slash; it uses the ordinary Admin account, not a service-role key. It creates one worked-example baseline and an in-progress draft with **6/30 answered** (opens at **Question 7**). A rerun reuses the same verified baseline and preserves any active draft and existing targets. It will not recreate a demo draft that was already submitted. Use a fresh fictional Admin and organisation to start the entire scenario again; don’t delete data to reset the run. Invite the stakeholder manually and test their login before the talk.

**Run of show (about six minutes):**

| Time | Screen/action | What to say or verify |
|---|---|---|
| 0:00 | Admin Assessment, Question 7 | Assess how an organisation manages the people side of an ERP rollout. Six dimensions, 30 criteria, same instrument for both roles. |
| 1:00 | Admin Dashboard → View results | Baseline: **61.33% — Managed**. Resilience is **48%**, **32 percentage points** short of its illustrative **80%** target. Targets explain priorities without changing the maturity score. |
| 2:00 | View recommendations → Open assessment report | Show the continuity action, explain why it was suggested, then show **Print / save PDF**. The seeder also prints a direct relative link to this report. |
| 3:00 | Second browser profile: stakeholder results; first profile: participation | Show the stakeholder’s private result in their own profile and only participation in the Admin profile. Rehearse real invitation and first submission beforehand. |
| 4:30 | Private Admin profile: Assessment, recovery enabled | Edit the seeded draft, wait for **Saved on this device**, disconnect, close and reopen the browser offline, show the answer still present, then reconnect and verify sync. Do not submit this demo draft unless you want a second completed record. |

**Fallback:** Save a fictional PDF report, a recording of the online and offline flows, and a screenshot of the seeded result on the presentation laptop. Do not rely on an offline restart to access historical results or printable reports; offline recovery deliberately opens only a saved draft. Rehearse the fallback with the network off.

## 3. What to update in the report and slides

| Where | Update |
|---|---|
| Abstract, architecture diagram, implementation and conclusion | Replace descriptions of a deployed NestJS layer with the current React/Vite PWA, shared TypeScript contracts, Supabase Auth/Postgres with row-level policies, and Supabase Edge Functions for invitations. If the dissertation is locked, present this as a clearly labelled post-submission implementation update. |
| Gap analysis, recommendation engine and reporting | Move target-based gap analysis and browser print/PDF from future work to implemented. Explain the submitted target snapshot, `max(0, target − actual)`, the worked example, and provisional gap priorities. Recommendations use criterion ratings, not automated interpretation of private free-text notes. |
| Privacy, evidence and offline operation | Clarify that the Admin sees participation, not stakeholder answers, notes, or individual scores. Notes are optional and do not change scoring. Offline restart requires prior opt-in on a private browser profile, confirmed local save, and a cached app; the grant lasts seven days and does not enable offline submission or access to reports. |
| Evaluation and claims | Do not reuse the earlier 25-test count or sign-in Lighthouse figures as measurements of this release. Record the final revision, actual test counts and environments, the staging two-account smoke result, and any fresh measurements. The earlier Chrome restart smoke used a mock backend, not hosted Supabase. |
| Limitations and research work | Keep Delphi review, practitioner case study, and user acceptance testing separate from engineering verification. Do not present the thresholds, recommendation content, or ERP adoption impact as empirically validated. Keep configurable questionnaire editing and stakeholder aggregation out of the presentation release. |

### Release sign-off

- [ ] Fresh checkout installs and builds, and the hosted deployment uses that revision.
- [ ] Live signup/reset and stakeholder invite are rehearsed; the two roles and a second organisation cannot see one another’s private records.
- [ ] The presentation laptop passes the [offline restart and reconnect walkthrough](SETUP.md#7-test-recovery-after-an-offline-restart).
- [ ] The baseline displays 61.33%, the gap is correct, and the browser-generated PDF is legible.
- [ ] Report, slides, and stated validation evidence agree; fallback files open without internet.
