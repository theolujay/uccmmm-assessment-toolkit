import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { AssessmentRecord } from '@assessment/contracts';
import { ImprovementRoadmap } from '../components/ImprovementRoadmap';
import { getAssessmentHistory } from '../services/assessment-service';

function displayDate(value: string): string { return new Intl.DateTimeFormat('en-NG', { dateStyle: 'long' }).format(new Date(value)); }

export function RecommendationsPage() {
  const [records, setRecords] = useState<AssessmentRecord[]>();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('assessment');
  const [error, setError] = useState<string>();
  const record = records?.find((item) => item.id === selectedId) ?? records?.[0];

  useEffect(() => {
    void getAssessmentHistory().then(setRecords)
      .catch((loadError) => { setError(loadError instanceof Error ? loadError.message : 'Could not load assessment history.'); setRecords([]); });
  }, []);

  if (!records) return <section className="loading-state" aria-live="polite">Loading recommendations…</section>;
  return <section>
    <div className="page-heading"><div><p className="eyebrow">Recommendations</p><h1>Actions to improve readiness</h1><p>Recommendations are tied to a specific assessment and date.</p></div>{record && <Link className="button secondary" to={`/reports?assessment=${encodeURIComponent(record.id)}`}>Open assessment report</Link>}</div>
    {error && <p className="page-error" role="alert">{error}</p>}
    {records.length > 0 && <div className="history-controls"><label htmlFor="recommendation-history">Assessment date</label><select id="recommendation-history" value={record?.id} onChange={(event) => setSearchParams({ assessment: event.target.value }, { replace: true })}>{records.map((item) => <option value={item.id} key={item.id}>{displayDate(item.submittedAt)} · {Math.round(item.overallScore)}%</option>)}</select></div>}
    {!record ? <article className="panel empty-state"><h2>Complete an assessment first</h2><p>Recommendations will be associated with a completed assessment.</p></article> : <ImprovementRoadmap record={record} />}
  </section>;
}
