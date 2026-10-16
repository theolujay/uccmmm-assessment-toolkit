import { useEffect, useState, type FormEvent } from 'react';
import { stakeholderInputSchema, type Stakeholder, type StakeholderInput, type ParticipationSummary } from '@assessment/contracts';
import { inviteStakeholder, listStakeholders, manageStakeholder } from '../services/stakeholder-service';
import { StatCard } from '../components/StatCard';

const emptySummary: ParticipationSummary = { invited: 0, completed: 0, inProgress: 0, notStarted: 0 };

function statusLabel(status: Stakeholder['assessmentStatus']): string {
  if (status === 'in_progress') return 'In progress';
  if (status === 'completed') return 'Completed';
  return 'Not started';
}

function invitationLabel(status: Stakeholder['invitationStatus']): string {
  return ({ pending: 'Pending', sent: 'Sent', email_failed: 'Email failed', revoked: 'Revoked' })[status];
}

export function StakeholdersPage() {
  const [people, setPeople] = useState<Stakeholder[]>([]);
  const [summary, setSummary] = useState(emptySummary);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('all');
  const [invitationFilter, setInvitationFilter] = useState<'all' | 'sent' | 'pending'>('all');
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const refresh = async () => {
    const nextPeople = await listStakeholders();
    setPeople(nextPeople);
    setSummary({
      invited: nextPeople.filter((person) => person.invitationStatus !== 'revoked').length,
      completed: nextPeople.filter((person) => person.invitationStatus !== 'revoked' && person.assessmentStatus === 'completed').length,
      inProgress: nextPeople.filter((person) => person.invitationStatus !== 'revoked' && person.assessmentStatus === 'in_progress').length,
      notStarted: nextPeople.filter((person) => person.invitationStatus !== 'revoked' && person.assessmentStatus === 'not_started').length,
    });
  };

  useEffect(() => { void refresh().catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Could not load stakeholders.')).finally(() => setLoading(false)); }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries()) as StakeholderInput;
    const parsed = stakeholderInputSchema.safeParse(values);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Check the stakeholder details.'); return; }
    setBusy(true); setError(undefined); setNotice(undefined);
    try {
      const result = await inviteStakeholder(parsed.data);
      setModalOpen(false);
      await refresh();
      setNotice(result.invitationStatus === 'pending' ? 'Stakeholder saved in this local demo. Connect Supabase and Resend to send invitations.' : 'Invitation email sent. The passcode was delivered to the stakeholder email.');
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'Could not invite this stakeholder.');
    } finally { setBusy(false); }
  };

  const action = async (person: Stakeholder, kind: 'resend' | 'reset_passcode' | 'revoke') => {
    if (kind === 'revoke' && !window.confirm(`Revoke access for ${person.fullName}?`)) return;
    setBusy(true); setError(undefined); setNotice(undefined);
    try {
      await manageStakeholder(person.id, kind);
      await refresh();
      setNotice(kind === 'revoke' ? 'Stakeholder access revoked.' : 'A replacement passcode was sent to the stakeholder.');
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Could not update stakeholder access.');
    } finally { setBusy(false); }
  };

  if (loading) return <section className="loading-state" aria-live="polite">Loading stakeholders…</section>;

  const departments = [...new Set(people.map((person) => person.department).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const filteredPeople = people.filter((person) => {
    const matchesSearch = `${person.fullName} ${person.email} ${person.department} ${person.jobRole}`.toLowerCase().includes(search.trim().toLowerCase());
    const matchesDepartment = department === 'all' || person.department === department;
    const matchesInvitation = invitationFilter === 'all'
      || (invitationFilter === 'sent' && person.invitationStatus === 'sent')
      || (invitationFilter === 'pending' && ['pending', 'email_failed'].includes(person.invitationStatus));
    return matchesSearch && matchesDepartment && matchesInvitation;
  });
  const pageCount = Math.max(1, Math.ceil(filteredPeople.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visiblePeople = filteredPeople.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return <section>
    <div className="page-heading"><div><p className="eyebrow">Administration</p><h1>Stakeholder assessment</h1><p>Invite participants and track assessment progress. Individual answers and scores stay private.</p></div><button className="button" onClick={() => { setError(undefined); setModalOpen(true); }}>Add stakeholder</button></div>
    {error && <p className="page-error" role="alert">{error}</p>}{notice && <p className="success-message" role="status">{notice}</p>}
    <div className="stats">
      <StatCard label="Invited" value={String(summary.invited)} />
      <StatCard label="Completed" value={String(summary.completed)} />
      <StatCard label="In progress" value={String(summary.inProgress)} />
      <StatCard label="Not started" value={String(summary.notStarted)} />
    </div>
    {people.length === 0 ? <article className="panel empty-state"><span aria-hidden="true">👥</span><h2>No stakeholders added yet</h2><p>Invite employees to complete their own private UCCMM assessment.</p><button className="button" onClick={() => setModalOpen(true)}>Add stakeholder</button></article> :
      <article className="panel table-panel">
        <div className="participant-toolbar">
          <div className="filter-tabs" aria-label="Filter by invitation status">
            <button type="button" aria-pressed={invitationFilter === 'all'} onClick={() => { setInvitationFilter('all'); setPage(1); }}>All <span>{people.length}</span></button>
            <button type="button" aria-pressed={invitationFilter === 'sent'} onClick={() => { setInvitationFilter('sent'); setPage(1); }}>Sent <span>{people.filter((person) => person.invitationStatus === 'sent').length}</span></button>
            <button type="button" aria-pressed={invitationFilter === 'pending'} onClick={() => { setInvitationFilter('pending'); setPage(1); }}>Pending <span>{people.filter((person) => ['pending', 'email_failed'].includes(person.invitationStatus)).length}</span></button>
          </div>
          <div className="participant-filters">
            <label className="visually-hidden" htmlFor="participant-search">Search stakeholders</label>
            <input id="participant-search" type="search" placeholder="Search stakeholders…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
            <label className="visually-hidden" htmlFor="participant-department">Filter by department</label>
            <select id="participant-department" value={department} onChange={(event) => { setDepartment(event.target.value); setPage(1); }}>
              <option value="all">All departments</option>{departments.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
        </div>
        <table><thead><tr><th>Name</th><th>Email</th><th>Department</th><th>Job role</th><th>Invitation</th><th>Assessment</th><th>Access</th></tr></thead>
        <tbody>{visiblePeople.length === 0 ? <tr><td colSpan={7} className="table-empty">No stakeholders match these filters.</td></tr> : visiblePeople.map((person) => <tr key={person.id}><td>{person.fullName}</td><td>{person.email}</td><td>{person.department}</td><td>{person.jobRole}</td><td><span className={`status ${person.invitationStatus.replace('_', '-')}`}>{invitationLabel(person.invitationStatus)}</span></td><td><span className={`status ${person.assessmentStatus.replace('_', '-')}`}>{statusLabel(person.assessmentStatus)}</span></td><td><div className="stakeholder-actions">
          {person.invitationStatus === 'revoked' ? <button disabled={busy} onClick={() => void action(person, 'reset_passcode')}>Re-invite</button> : <><button disabled={busy} onClick={() => void action(person, 'resend')}>{person.invitationStatus === 'email_failed' ? 'Retry invite' : 'Send new passcode'}</button><button className="danger" disabled={busy} onClick={() => void action(person, 'revoke')}>Revoke</button></>}
        </div></td></tr>)}</tbody></table></article>}
        <footer className="participant-pagination"><span>Showing {filteredPeople.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filteredPeople.length)} of {filteredPeople.length}</span><div><button className="button secondary" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage} of {pageCount}</span><button className="button secondary" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div></footer>
    {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setModalOpen(false); }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="invite-heading">
        <button className="modal-close" aria-label="Close" onClick={() => setModalOpen(false)}>×</button><p className="eyebrow">New participant</p><h2 id="invite-heading">Add stakeholder</h2><p>We’ll email an individual passcode and access instructions after you add them.</p>
        <form className="modal-form" onSubmit={(event) => void submit(event)}>
          <label>Stakeholder name<input name="fullName" autoComplete="name" required minLength={2} /></label>
          <label>Email address<input name="email" type="email" autoComplete="email" required /></label>
          <label>Department<input name="department" required /></label>
          <label>Job role<input name="jobRole" required /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal-form-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => setModalOpen(false)}>Cancel</button><button className="button" disabled={busy}>{busy ? 'Adding…' : 'Add stakeholder'}</button></div>
        </form>
      </section>
    </div>}
  </section>;
}
