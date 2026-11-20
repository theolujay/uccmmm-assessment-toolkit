# Maturity scoring, targets, and improvement planning

This implementation follows the six-dimension, 30-criterion model in Chapter 3 of the project report. It keeps the academic score independent of the organisation's goals.

## Scoring and gap analysis

- Each dimension score is the sum of its five 1–5 ratings divided by 25, multiplied by 100. The six scores carry equal weight in the overall mean. The attainable range is 20–100%.
- Maturity bands have inclusive upper bounds: 20% Initial, 40% Developing, 60% Defined, 80% Managed, and 100% Optimising. Scores above one boundary enter the next band. The worked example (76, 64, 60, 52, 68, 48) yields 61.33% and is Managed.
- In **Account settings**, an Admin can set a whole-number target of 20–100% for any dimension. Blank means no target. The values in force when the Admin submits are copied into that baseline. Later edits affect future submissions only. Legacy assessments, and stakeholder assessments, have no captured targets.
- A gap is `max(0, target − actual)` percentage points. A gap of zero means the target was met or exceeded; a blank target is not scored as either success or failure. The dashboard and report show the largest measured shortfalls first, breaking ties by lower actual score and then dimension ID. Dimension scores are also available separately, weakest first.
- **Provisional priority rules:** high at ≥20 percentage points; medium at ≥10 but <20; low for a positive gap <10. These cutoffs are explicit implementation choices, not numerical thresholds from the research report. A high-priority gap qualifies, but never changes, the academic maturity level. A low score without a target can be described as a weakness, not a target gap.

## Recommendations and report

The roadmap applies fixed dimension and maturity-level rules, leading with the largest positive target gaps. A dimension with no target can still receive an action based on maturity. Low ratings on the continuity-plan and backup-arrangements criteria refine resilience guidance; the system does not infer actual outages, analyse private free-text notes, or send them to any external service for recommendations. The rules and actions remain draft pending expert validation.

An Admin can follow a selected result into its recommendations and report. **Print / save PDF** opens the browser's print dialog. It includes the Admin baseline's private notes if present, so treat the exported report as sensitive. Stakeholder names, individual answers, and individual results are not included. Optional ERP profile metadata is labelled current, not historical.

## Offline behaviour

While signed in online to a Supabase-connected production PWA, open **Assessment → Offline recovery on this device** and choose **Enable offline recovery**. Use this only on a private device. The opt-in lasts seven days in the same browser profile. After **Saved on this device** appears, the answers, evidence, and active question can be recovered if the browser closes while offline. Reopen the installed app or its usual URL in the same profile. Clearing or evicting site data can remove the app cache, grant, and local drafts.

Recovery lets anyone using that browser profile open the saved draft without a password, but it cannot open dashboards, results, reports, or admin tools. Local data is not an encrypted vault. Reconnecting verifies the same account with Supabase before sync or submission is allowed. Signing out, detecting an account switch, or choosing **Forget this device** revokes recovery; forgetting disables access without deleting the draft. Demo mode does not exercise production recovery or sync.

## Developer guardrails

Treat the v1 questions, response scale, weights, formula, and bands as fixed unless the author approves a change. Use `packages/contracts/src/scoring-acceptance.test.ts` for the Table 5.2 scoring cases. Keep the TypeScript scoring and the PostgreSQL `classify_maturity_score` and `validate_assessment_record` functions in sync. When a change affects both, update the contracts first, add a new migration rather than rewriting a shipped one, and then update the UI. Targets, evidence, and recommendations do not change the academic score.

## Verification and remaining work

- The contracts suite covers the report's scoring examples and boundaries, target ranking, draft priority rules, and continuity guidance. The web suite tests the target form, historical selection, report export entry point, and stakeholder view. Use `pnpm -r test --maxWorkers=1` to run both suites.
- Before deployment, run the regressions on a disposable Supabase database and then smoke-test signup, invitations, reconnect/sync, and cross-device history against your configured staging project. See [Supabase deployment](supabase/README.md).
- The current 30-item instrument and maturity bands are versioned in code. Admin editing of dimensions, criteria, bands, and rule definitions needs a publish/version workflow that preserves comparability of earlier assessments. In v1 only organisation targets are configurable.
- Hosted checks, mobile accessibility and performance audits, expert Delphi review, the practitioner case study, and user acceptance testing are separate from automated verification. None is implied by a passing suite.
