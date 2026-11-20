import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AssessmentRecord, ParticipationSummary } from '@assessment/contracts';
import { RadarChart } from '../components/RadarChart';
import { StatCard } from '../components/StatCard';
import { formatScore } from '../lib/format-score';
import { getLatestAssessment } from '../services/assessment-service';
import { getParticipationSummary } from '../services/stakeholder-service';

const emptySummary: ParticipationSummary = { invited: 0, completed: 0, inProgress: 0, notStarted: 0 };

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const [record, setRecord] = useState<AssessmentRecord | null>();
  const [participation, setParticipation] = useState(emptySummary);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void Promise.all([getLatestAssessment(), getParticipationSummary()])
      .then(([latest, counts]) => { setRecord(latest ?? null); setParticipation(counts); })
      .catch((loadError) => { setError(loadError instanceof Error ? loadError.message : 'Could not load organisation overview.'); setRecord(null); });
  }, []);

  if (record === undefined) return <section className="loading-state" aria-live="polite">Loading organisation overview…</section>;

  return <section>
    <div className="page-heading"><div><p className="eyebrow">Overview</p><h1>Admin dashboard</h1><p>Review your baseline assessment and stakeholder participation.</p></div><div className="dashboard-actions"><button className="button" onClick={() => navigate('/assessment')}>{record ? 'Start new assessment' : 'Start assessment'}</button><button className="button secondary" disabled={!record} onClick={() => navigate('/results')}>View results</button><button className="button secondary" disabled={!record} onClick={() => navigate('/reports')}>View report</button></div></div>
    {error && <p className="page-error" role="alert">{error}</p>}
    <div className="stats">
      <StatCard label="Stakeholders invited" value={String(participation.invited)} />
      <StatCard label="Completed" value={String(participation.completed)} />
      <StatCard label="In progress" value={String(participation.inProgress)} />
      <StatCard label="Not started" value={String(participation.notStarted)} />
    </div>
    {!record ? <article className="panel empty-state admin-empty-state"><span aria-hidden="true">📊</span><h2>No admin assessment data yet</h2><p>Complete your own baseline assessment. Stakeholder answers and scores remain private from this dashboard.</p><button className="button" onClick={() => navigate('/assessment')}>Start assessment</button></article> : <>
      <div className="results-grid results-overview">
        <article className="panel score-panel"><h2>Your organisation baseline</h2><div className="score-ring"><strong>{formatScore(record.overallScore)}</strong></div><b>{record.overallMaturityLevel}</b><p>Based on your private Admin assessment.</p></article>
        <article className="panel radar-panel"><h2>Maturity by dimension</h2><RadarChart scores={record.dimensionScores} /></article>
      </div>
      <article className="panel dimension-panel result-dimension-panel"><h2>Dimension scores</h2>{record.dimensionScores.map((dimension) => <div className="score-row" key={dimension.dimensionId}>
        <div><span>{dimension.dimensionName}</span><b>{formatScore(dimension.scorePercentage)}</b></div><div className="bar"><i style={{ width: `${dimension.scorePercentage}%` }} /></div><small>{dimension.maturityLevel}</small>
      </div>)}</article>
    </>}
    <p className="privacy-note">Stakeholder participation is shown separately from private answers and individual results.</p>
  </section>;
}
