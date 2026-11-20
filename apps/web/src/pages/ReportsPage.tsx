import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { qualifyOverallResult, rankDimensions, type AssessmentRecord, type OrganisationProfile } from '@assessment/contracts';
import { useAuth } from '../auth/AuthProvider';
import { DimensionEvidence } from '../components/DimensionEvidence';
import { RadarChart } from '../components/RadarChart';
import { ImprovementRoadmap } from '../components/ImprovementRoadmap';
import { TargetGapPanel } from '../components/TargetGapPanel';
import { formatScore } from '../lib/format-score';
import { getAssessmentHistory } from '../services/assessment-service';
import { getOrganisationProfile } from '../services/organisation-service';

function displayDate(value: string): string { return new Intl.DateTimeFormat('en-NG', { dateStyle: 'long' }).format(new Date(value)); }

export function ReportsPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<AssessmentRecord[]>();
  const [organisation, setOrganisation] = useState<OrganisationProfile>();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('assessment');
  const [error, setError] = useState<string>();
  const record = records?.find((item) => item.id === selectedId) ?? records?.[0];

  useEffect(() => {
    void getAssessmentHistory().then(setRecords)
      .catch((loadError) => { setError(loadError instanceof Error ? loadError.message : 'Could not load report data.'); setRecords([]); });
    void getOrganisationProfile().then(setOrganisation).catch(() => setOrganisation(undefined));
  }, []);

  if (!records) return <section className="loading-state" aria-live="polite">Preparing assessment report…</section>;
  return <section>
    <div className="page-heading screen-only"><div><p className="eyebrow">Reporting</p><h1>Assessment report</h1><p>Print your Admin baseline or choose Save as PDF in the print dialog.</p></div>{record && <button className="button" onClick={() => window.print()}>Print / save PDF</button>}</div>
    {error && <p className="page-error" role="alert">{error}</p>}
    {records.length > 1 && <div className="history-controls screen-only"><label htmlFor="report-history">Assessment date</label><select id="report-history" value={record?.id} onChange={(event) => setSearchParams({ assessment: event.target.value }, { replace: true })}>{records.map((item) => <option key={item.id} value={item.id}>{displayDate(item.submittedAt)} · {formatScore(item.overallScore)}</option>)}</select></div>}
    {!record ? <article className="panel empty-state"><span aria-hidden="true">📄</span><h2>No report data yet</h2><p>Complete an Admin assessment before generating a report.</p></article> : <article className="report-sheet">
      <header className="report-header"><div><p className="eyebrow">UCCMM Assessment Toolkit</p><h1>Change management maturity report</h1><p>{organisation?.name ?? user?.organizationName}</p></div><div><b>{displayDate(record.submittedAt)}</b><p>Assessment {record.assessmentVersion}</p></div></header>
      <div className="report-meta"><article><small>Overall score</small><strong>{formatScore(record.overallScore)}</strong></article><article><small>Maturity level</small><strong>{qualifyOverallResult(record).label}</strong></article><article><small>ERP platform (current)</small><strong>{organisation?.erpPlatform ?? '—'}</strong></article><article><small>Implementation stage (current)</small><strong>{organisation?.implementationStage.replaceAll('_', ' ') ?? '—'}</strong></article></div>
      <article className="panel"><h2>Maturity by dimension</h2><RadarChart scores={record.dimensionScores} /></article>
      <article className="panel dimension-panel report-dimension-list"><h2>Dimension scores, weakest first</h2>{rankDimensions(record.dimensionScores).map((dimension) => <div className="score-row" key={dimension.dimensionId}>
        <header className="report-score-summary">
          <div><span>{dimension.dimensionName}</span><b>{formatScore(dimension.scorePercentage)}</b></div>
          <div className="bar"><i style={{ width: `${dimension.scorePercentage}%` }} /></div><small>{dimension.maturityLevel}</small>
        </header>
        <DimensionEvidence record={record} dimensionId={dimension.dimensionId} />
      </div>)}</article>
      <TargetGapPanel record={record} />
      <ImprovementRoadmap record={record} />
      <p className="privacy-note">This report contains your Admin assessment only, including any private notes you added. It does not contain stakeholder answers, evidence, or individual results.</p>
    </article>}
  </section>;
}
