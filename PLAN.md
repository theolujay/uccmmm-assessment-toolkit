# Project roadmap

## Implemented

- Fixed `uccmm-v1` questionnaire: 30 items, six equally weighted dimensions, and five maturity bands.
- Admin onboarding, stakeholder invitations and participation tracking, and respondent-only assessment records.
- IndexedDB draft autosave, optional evidence, online sync, and opt-in offline restart recovery.
- Submitted target snapshots, gap ranking, provisional recommendations, and browser print/PDF reports.
- Vercel frontend, Supabase migrations and invitation functions, and a repeatable fictional baseline seeder.

## Before the presentation

Use the [presentation runbook](PRESENTATION.md#release-sign-off). Rehearse the live invite → sign-in → completion flow with two browser profiles, confirm that private stakeholder data stays private, and test offline restart and resync on the presentation device. Save a sample PDF and screen recording for a network outage. Keep software checks distinct from research validation in the presentation materials.

## After the presentation

- Run Delphi review, a practitioner case study, and user acceptance testing before calling the model or guidance validated.
- If instrument editing is needed, design a versioned publishing workflow before allowing changes to questions, bands, or weights. The existing instrument is fixed unless the project author approves a change.
- Consider longitudinal reporting or aggregate stakeholder results only after defining how comparable scores and respondent privacy would be maintained.

[`GUIDE.md`](GUIDE.md) and [`PROMPT.md`](PROMPT.md) are historical design references, not current setup instructions. Use [`SETUP.md`](SETUP.md) for configuration and [`MATURITY-PLANNING.md`](MATURITY-PLANNING.md) for current assessment behaviour.
