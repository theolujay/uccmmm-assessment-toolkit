import { useEffect, useState } from 'react';
import type { AssessmentRecord } from '@assessment/contracts';
import { getAssessmentHistory } from '../services/assessment-service';

function displayDate(value: string): string { return new Intl.DateTimeFormat('en-NG', { dateStyle: 'long' }).format(new Date(value)); }

export function RecommendationsPage() {
  const [records, setRecords] = useState<AssessmentRecord[]>();
  const [selectedId, setSelectedId] = useState<string>();
  const [error, setError] = useState<string>();
  const record = records?.find((item) => item.id === selectedId) ?? records?.[0];

  useEffect(() => {
    void getAssessmentHistory().then((history) => { setRecords(history); setSelectedId(history[0]?.id); })
      .catch((loadError) => { setError(loadError instanceof Error ? loadError.message : 'Could not load assessment history.'); setRecords([]); });
  }, []);

  if (!records) return <section className="loading-state" aria-live="polite">Loading recommendations…</section>;
  return <section>
    <div className="page-heading"><div><p className="eyebrow">Recommendations</p><h1>Actions to improve readiness</h1><p>Recommendations are tied to a specific assessment and date.</p></div></div>
    {error && <p className="page-error" role="alert">{error}</p>}
    {records.length > 0 && <div className="history-controls"><label htmlFor="recommendation-history">Assessment date</label><select id="recommendation-history" value={record?.id} onChange={(event) => setSelectedId(event.target.value)}>{records.map((item) => <option value={item.id} key={item.id}>{displayDate(item.submittedAt)} · {Math.round(item.overallScore)}%</option>)}</select></div>}
    {!record ? <article className="panel empty-state"><h2>Complete an assessment first</h2><p>Recommendations will be associated with a completed assessment.</p></article> : <article className="panel empty-state"><span aria-hidden="true">✦</span><h2>Recommendation guidance is being prepared</h2><p>Your {displayDate(record.submittedAt)} assessment is saved. Approved recommendation rules and content have not been provided yet, so this page does not make up actions or advice.</p></article>}
  </section>;
}
