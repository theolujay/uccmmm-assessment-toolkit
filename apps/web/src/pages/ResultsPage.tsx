import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { qualifyOverallResult, rankDimensions, type AssessmentRecord } from '@assessment/contracts';
import { useAuth } from '../auth/AuthProvider';
import { DimensionEvidence } from '../components/DimensionEvidence';
import { RadarChart } from '../components/RadarChart';
import { TargetGapPanel } from '../components/TargetGapPanel';
import { formatScore } from '../lib/format-score';
import { getAssessmentHistory } from '../services/assessment-service';


function formatDate(value: string): string { return new Intl.DateTimeFormat('en-NG', { dateStyle: 'long' }).format(new Date(value)); }

export function ResultsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [records, setRecords] = useState<AssessmentRecord[]>();
  const [selectedId, setSelectedId] = useState<string>();
  const [error, setError] = useState<string>();
  const record = records?.find((item) => item.id === selectedId) ?? records?.[0];

  useEffect(() => {
    void getAssessmentHistory().then((history) => { setRecords(history); setSelectedId(history[0]?.id); })
      .catch((loadError) => { setError(loadError instanceof Error ? loadError.message : 'Could not load assessment results.'); setRecords([]); });
  }, []);

  if (!records) return <section className="loading-state" aria-live="polite">Loading your results…</section>;
  if (!record) return <section>
    <div className="page-heading"><div><p className="eyebrow">Assessment results</p><h1>No assessment data yet</h1><p>Complete the UCCMM assessment to see your maturity profile.</p></div></div>
    {error && <p className="page-error" role="alert">{error}</p>}
    <article className="panel empty-state"><span aria-hidden="true">📊</span><h2>Your maturity profile will appear here</h2><p>Your submitted answers are scored across all six UCCMM dimensions.</p><button className="button" onClick={() => navigate('/assessment')}>Start assessment</button></article>
  </section>;

  const qualification = qualifyOverallResult(record);
  const isAdmin = user?.role === 'admin' && record.respondentType === 'admin';
  return <section>
    <div className="page-heading"><div><p className="eyebrow">{isAdmin ? 'Admin assessment' : 'Your results'}</p><h1>Maturity profile</h1><p>Submitted {formatDate(record.submittedAt)}.</p></div>{isAdmin && <Link className="button secondary" to={`/recommendations?assessment=${encodeURIComponent(record.id)}`}>View recommendations</Link>}</div>
    {records.length > 1 && <div className="history-controls screen-only"><label htmlFor="result-history">Past assessments</label><select id="result-history" value={record.id} onChange={(event) => setSelectedId(event.target.value)}>{records.map((item) => <option value={item.id} key={item.id}>{formatDate(item.submittedAt)} · {formatScore(item.overallScore)}</option>)}</select></div>}
    <div className="results-grid results-overview">
      <article className="panel score-panel"><h2>Overall maturity score</h2><div className="score-ring"><strong>{formatScore(record.overallScore)}</strong></div><b>{record.overallMaturityLevel}</b>{qualification.severity !== 'none' && <p className={`result-qualification ${qualification.severity}`}>{qualification.label}</p>}<p>Calculated from all {Object.keys(record.responses).length} UCCMM responses.</p></article>
      <article className="panel radar-panel"><h2>Maturity by dimension</h2><RadarChart scores={record.dimensionScores} /></article>
    </div>
    <article className="panel dimension-panel result-dimension-panel"><h2>Dimension scores, weakest first</h2>{rankDimensions(record.dimensionScores).map((dimension) => <div className="score-row" key={dimension.dimensionId}>
      <div><span>{dimension.dimensionName}</span><b>{formatScore(dimension.scorePercentage)}</b></div>
      <div className="bar"><i style={{ width: `${dimension.scorePercentage}%` }} /></div><small>{dimension.maturityLevel}</small>
      <DimensionEvidence record={record} dimensionId={dimension.dimensionId} />
    </div>)}</article>
    {isAdmin && <TargetGapPanel record={record} showSettingsLink />}
  </section>;
}
