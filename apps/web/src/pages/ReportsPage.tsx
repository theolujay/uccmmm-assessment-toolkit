import { useEffect, useState } from 'react';
import type { AssessmentRecord, OrganisationProfile } from '@assessment/contracts';
import { useAuth } from '../auth/AuthProvider';
import { RadarChart } from '../components/RadarChart';
import { getAssessmentHistory } from '../services/assessment-service';
import { getOrganisationProfile } from '../services/organisation-service';

function displayDate(value: string): string { return new Intl.DateTimeFormat('en-NG', { dateStyle: 'long' }).format(new Date(value)); }

export function ReportsPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<AssessmentRecord[]>();
  const [organisation, setOrganisation] = useState<OrganisationProfile>();
  const [selectedId, setSelectedId] = useState<string>();
  const [error, setError] = useState<string>();
  const record = records?.find((item) => item.id === selectedId) ?? records?.[0];

  useEffect(() => {
    void Promise.all([getAssessmentHistory(), getOrganisationProfile()])
      .then(([history, profile]) => { setRecords(history); setSelectedId(history[0]?.id); setOrganisation(profile); })
      .catch((loadError) => { setError(loadError instanceof Error ? loadError.message : 'Could not load report data.'); setRecords([]); });
  }, []);

  if (!records) return <section className="loading-state" aria-live="polite">Preparing assessment report…</section>;
  return <section>
    <div className="page-heading screen-only"><div><p className="eyebrow">Reporting</p><h1>Assessment report</h1><p>Print a report for your Admin baseline assessment.</p></div>{record && <button className="button" onClick={() => window.print()}>Download report</button>}</div>
    {error && <p className="page-error" role="alert">{error}</p>}
    {records.length > 1 && <div className="history-controls screen-only"><label htmlFor="report-history">Assessment date</label><select id="report-history" value={record?.id} onChange={(event) => setSelectedId(event.target.value)}>{records.map((item) => <option key={item.id} value={item.id}>{displayDate(item.submittedAt)} · {Math.round(item.overallScore)}%</option>)}</select></div>}
    {!record ? <article className="panel empty-state"><span aria-hidden="true">📄</span><h2>No report data yet</h2><p>Complete an Admin assessment before generating a report.</p></article> : <article className="report-sheet">
      <header className="report-header"><div><p className="eyebrow">UCCMM Assessment Toolkit</p><h1>Change management maturity report</h1><p>{organisation?.name ?? user?.organizationName}</p></div><div><b>{displayDate(record.submittedAt)}</b><p>Assessment {record.assessmentVersion}</p></div></header>
      <div className="report-meta"><article><small>Overall score</small><strong>{Math.round(record.overallScore)}%</strong></article><article><small>Maturity level</small><strong>{record.overallMaturityLevel}</strong></article><article><small>ERP platform</small><strong>{organisation?.erpPlatform ?? '—'}</strong></article><article><small>Implementation stage</small><strong>{organisation?.implementationStage.replaceAll('_', ' ') ?? '—'}</strong></article></div>
      <article className="panel"><h2>Maturity by dimension</h2><RadarChart scores={record.dimensionScores} /></article>
      <article className="panel dimension-panel report-dimension-list"><h2>Dimension scores</h2>{record.dimensionScores.map((dimension) => <div className="score-row" key={dimension.dimensionId}><div><span>{dimension.dimensionName}</span><b>{Math.round(dimension.scorePercentage)}%</b></div><div className="bar"><i style={{ width: `${dimension.scorePercentage}%` }} /></div><small>{dimension.maturityLevel}</small></div>)}</article>
      <article className="panel report-recommendations"><h2>Recommendations</h2><p>Approved recommendation rules and content have not been provided yet. Recommendations are not included in this report.</p></article>
      <p className="privacy-note">This report contains the Admin assessment only. It does not contain identifiable stakeholder answers or individual results.</p>
    </article>}
  </section>;
}
