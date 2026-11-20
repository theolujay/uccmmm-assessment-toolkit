# Supabase deployment

The migrations create organisation membership, stakeholder participation, draft sync, and immutable assessment records. RLS lets Admins read stakeholder participation while each draft, result, and evidence note remains readable only by its respondent. Apply `20261119000200_maturity_targets.sql` before deploying the web app that enables target settings.

1. Create a Supabase project and set the web app variables in `apps/web/.env.local` using `apps/web/.env.example`.
2. Run `supabase link --project-ref <project-ref>` and `supabase db push`.
3. Set the Edge Function secrets listed in `SETUP.md`.
4. Verify the sender domain in Resend and set the invitation `from` address.
5. Deploy `invite-stakeholder` and `manage-stakeholder` with `supabase functions deploy`.
6. Configure the Supabase Auth Site URL and `/reset-password` redirect allowlist, then enable Admin email confirmation.

Only the public anon key belongs in the browser. The service-role key is used by the Edge Functions after verifying the caller’s Admin membership. It bypasses RLS and must remain a server secret.

Only organisation Admins can update `organizations.maturity_targets`. The database copies those settings into `assessment_records.target_snapshot` for new Admin baselines, not stakeholder submissions. The submission RPC signature is unchanged and older assessments are not backfilled. Run `psql -f supabase/regression/fr8_maturity_targets.sql` as the migration owner on a disposable, migrated database to exercise access, validation, and snapshot behaviour. Stakeholder aggregation is intentionally absent until its calculation and privacy rules are defined.
