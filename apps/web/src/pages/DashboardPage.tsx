import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AssessmentRecord } from '@assessment/contracts';
import { questionCount } from '../data/assessment';
import { getLatestAssessment } from '../services/assessment-service';

export function DashboardPage() {
  const navigate = useNavigate();
  const [record, setRecord] = useState<AssessmentRecord | null>();
  const [error, setError] = useState<string>();

  useEffect(() => { void getLatestAssessment().then((latestRecord) => setRecord(latestRecord ?? null)).catch((loadError) => { setError(loadError instanceof Error ? loadError.message : 'Could not load your assessment.'); setRecord(null); }); }, []);

  if (record === undefined) return <section className="loading-state" aria-live="polite">Loading your assessment…</section>;

  if (record) return <section>
    <div className="page-heading"><div><p className="eyebrow">Stakeholder portal</p><h1>Your assessment is complete</h1><p>Review your personal readiness profile whenever you need it.</p></div><button className="button" onClick={() => navigate('/results')}>View results</button></div>
    <article className="panel completion-state"><span>{Math.round(record.overallScore)}%</span><div><h2>{record.overallMaturityLevel} maturity</h2><p>Your latest assessment covers all {questionCount} UCCMM questions.</p></div></article>
  </section>;

  return <section><div className="page-heading"><div><p className="eyebrow">Stakeholder portal</p><h1>Welcome back</h1><p>Complete your readiness assessment to help your organisation prepare for ERP go-live.</p></div><button className="button" onClick={() => navigate('/assessment')}>Start assessment</button></div>{error && <p className="page-error" role="alert">{error}</p>}<article className="panel empty-state"><span aria-hidden="true">📊</span><h2>No assessment data yet</h2><p>Complete all {questionCount} questions across six dimensions to see your personal readiness profile.</p><button className="button" onClick={() => navigate('/assessment')}>Start assessment</button></article></section>;
}
