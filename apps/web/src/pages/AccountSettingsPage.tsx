import { useEffect, useState, type FormEvent } from 'react';
import { organisationProfileSchema, type OrganisationProfile } from '@assessment/contracts';
import { useAuth } from '../auth/AuthProvider';
import { getOrganisationProfile, updateOrganisationProfile } from '../services/organisation-service';

export function AccountSettingsPage() {
  const { user, refresh } = useAuth();
  const [profile, setProfile] = useState<OrganisationProfile>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    void getOrganisationProfile().then(setProfile).catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Could not load organisation settings.')).finally(() => setLoading(false));
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const parsed = organisationProfileSchema.safeParse({ ...values, employeeCount: Number(values.employeeCount) });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Check the organisation details.'); return; }
    setBusy(true); setError(undefined); setMessage(undefined);
    try {
      await updateOrganisationProfile(parsed.data);
      setProfile(parsed.data);
      await refresh();
      setMessage('Organisation details saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save organisation settings.');
    } finally { setBusy(false); }
  };

  if (loading) return <section className="loading-state" aria-live="polite">Loading account settings…</section>;

  return <section>
    <div className="page-heading"><div><p className="eyebrow">Administration</p><h1>Account settings</h1><p>Manage your organisation details and Admin sign-in.</p></div></div>
    {error && <p className="page-error" role="alert">{error}</p>}
    {profile && <article className="panel settings-panel">
      <h2>Organisation profile</h2>
      <form className="settings-form" onSubmit={(event) => void submit(event)}>
        <label>Organisation name<input name="name" defaultValue={profile.name} required minLength={2} /></label>
        <label>Sector<input name="sector" defaultValue={profile.sector} required /></label>
        <label>Number of employees<input name="employeeCount" type="number" min="1" defaultValue={profile.employeeCount} required /></label>
        <label>ERP platform<input name="erpPlatform" defaultValue={profile.erpPlatform} required /></label>
        <label className="full-width">Implementation stage<select name="implementationStage" defaultValue={profile.implementationStage} required><option value="planning">Planning</option><option value="in_progress">In progress</option><option value="post_go_live">Post-Go-Live</option></select></label>
        <div className="settings-actions full-width"><button className="button" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
      </form>
      <hr />
      <h2>Admin account</h2><dl><dt>Email</dt><dd>{user?.email}</dd></dl>
      <p>Password reset links are sent to your Admin email.</p>
      <a className="button secondary" href="/forgot-password">Reset password</a>
      {message && <p className="success-message" role="status">{message}</p>}
    </article>}
  </section>;
}
