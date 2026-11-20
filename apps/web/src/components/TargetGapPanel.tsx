import { useId } from 'react';
import { calculateDimensionGaps, targetGapPriorityPolicy, type AssessmentRecord } from '@assessment/contracts';
import { Link } from 'react-router-dom';

export function TargetGapPanel({ record, showSettingsLink = false }: { record: AssessmentRecord; showSettingsLink?: boolean }) {
  const titleId = useId();
  const gaps = calculateDimensionGaps(record.dimensionScores, record.targetSnapshot);
  const hasTargets = gaps.some((dimension) => dimension.targetPercentage !== undefined);

  return <section className="panel gap-panel" aria-labelledby={titleId}>
    <h2 id={titleId}>Target gap analysis</h2>
    {!hasTargets ? <p>No targets were recorded for this assessment. Its dimension scores are still available.</p> : <>
      <p>Compared with the targets in place at submission, largest shortfall first. Draft priority rules: high ≥{targetGapPriorityPolicy.highGapMin} percentage points, medium ≥{targetGapPriorityPolicy.mediumGapMin}, low below {targetGapPriorityPolicy.mediumGapMin} but above zero.</p>
      <ol className="gap-list">
        {gaps.map(({ dimensionId, dimensionName, scorePercentage, targetPercentage, gap, priority }) => <li key={dimensionId}>
          <div className="gap-row"><h3>{dimensionName}</h3><span>{gap === undefined ? 'No target' : gap === 0 ? 'Target met' : `${gap} pp short · ${priority} priority`}</span></div>
          {targetPercentage !== undefined && <div className="gap-meter" aria-hidden="true">
            <i style={{ width: `${scorePercentage}%` }} />
            <i className="gap-shortfall" style={{ left: `${scorePercentage}%`, width: `${gap ?? 0}%` }} />
            <i className="gap-target" style={{ left: `${targetPercentage}%` }} />
          </div>}
          <p>Actual {Math.round(scorePercentage)}%{targetPercentage !== undefined && ` · Target ${targetPercentage}%`}</p>
        </li>)}
      </ol>
    </>}
    {showSettingsLink && <Link className="gap-settings-link screen-only" to="/settings">Manage targets for future assessments</Link>}
  </section>;
}
