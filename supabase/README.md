# Supabase deployment

The migration creates organisation membership, stakeholder participation, offline draft sync, and immutable assessment records. RLS lets Admins read their organisation and stakeholder participation list while each assessment draft and result remains readable only by its respondent.

1. Create a Supabase project and set the web app variables in `apps/web/.env.local` using `apps/web/.env.example`.
2. Run `supabase link --project-ref <project-ref>` and `supabase db push`.
3. Set the Edge Function secrets listed in `SETUP.md`.
4. Verify the sender domain in Resend and set the invitation `from` address.
5. Deploy `invite-stakeholder` and `manage-stakeholder` with `supabase functions deploy`.
6. Configure the Supabase Auth Site URL and `/reset-password` redirect allowlist, then enable Admin email confirmation.

Only the public anon key belongs in the browser. The service-role key is used by the Edge Functions after verifying the caller’s Admin membership. It bypasses RLS and must remain a server secret.

The v1 recommendation interface is connected to assessment history but does not generate advice until approved rules and content are added. Stakeholder maturity aggregation is also intentionally absent until its calculation method is defined.
