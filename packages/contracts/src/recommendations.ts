import type { AssessmentResponses, AssessmentScoreSummary, DimensionScore, MaturityBand, MaturityLevel, MaturityTargets } from './index';

/**
 * Rule chain (Report 3.5.6): response -> dimension score -> maturity level
 * -> capability gap -> priority -> recommendation. No machine learning; every
 * output traces to the score, level, target (when set), and any criterion that refined it.
 */

const levelOrder: readonly MaturityLevel[] = ['Initial', 'Developing', 'Defined', 'Managed', 'Optimising'];

function levelIndex(level: MaturityLevel): number {
  return levelOrder.indexOf(level);
}

export type RecommendationPriority = 'high' | 'medium' | 'low';
export type RecommendationPriorityBasis = 'target-gap' | 'target-met' | 'maturity-level';

/**
 * DRAFT implementation policy, not numeric thresholds from Report 3.5.6 and not expert-validated.
 * A shortfall of a full default maturity band (20 percentage points) is high; half a band
 * (10 to <20) is medium; a smaller positive gap is low. Met/unset targets have no gap priority.
 */
export const targetGapPriorityPolicy = { status: 'draft', highGapMin: 20, mediumGapMin: 10 } as const;

export interface DimensionGap extends DimensionScore {
  targetPercentage: number | undefined;
  /** Percentage points short of target; 0 if met/exceeded, undefined if no target was set. */
  gap: number | undefined;
  /** Priority from a positive gap only, without a low-score fallback. */
  priority: RecommendationPriority | undefined;
}

function gapPriority(gap: number | undefined): RecommendationPriority | undefined {
  if (gap === undefined || gap <= 0) return undefined;
  if (gap >= targetGapPriorityPolicy.highGapMin) return 'high';
  return gap >= targetGapPriorityPolicy.mediumGapMin ? 'medium' : 'low';
}

function compareIds(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

function compareActualThenId(
  first: Pick<DimensionScore, 'scorePercentage' | 'dimensionId'>,
  second: Pick<DimensionScore, 'scorePercentage' | 'dimensionId'>,
): number {
  return first.scorePercentage - second.scorePercentage || compareIds(first.dimensionId, second.dimensionId);
}

/** Avoid floating-point noise at whole-point boundaries (e.g. 76 - 56.00000000000001). */
function pointsShortOf(threshold: number, actual: number): number {
  const difference = Math.max(0, threshold - actual);
  const whole = Math.round(difference);
  return Math.abs(difference - whole) < 1e-9 ? whole : difference;
}

/** Largest measured gap first (including met targets); unset targets sort last. No inputs are changed. */
export function calculateDimensionGaps(scores: readonly DimensionScore[], targets: MaturityTargets = {}): DimensionGap[] {
  return scores.map((score) => {
    const { dimensionId, scorePercentage } = score;
    const targetPercentage = Object.hasOwn(targets, dimensionId) ? targets[dimensionId as keyof MaturityTargets] : undefined;
    const gap = targetPercentage === undefined ? undefined : pointsShortOf(targetPercentage, scorePercentage);
    return { ...score, targetPercentage, gap, priority: gapPriority(gap) };
  }).sort((first, second) => (second.gap ?? -1) - (first.gap ?? -1) || compareActualThenId(first, second));
}

const continuityCriteria = ['resilience-1', 'resilience-4'] as const;
export type ContinuityCriterionId = typeof continuityCriteria[number];

export interface ContinuityEvidence {
  /** Availability of the two criterion ratings, not verification of actual outages. */
  availability: 'unavailable' | 'partial' | 'available';
  lowRatedCriteria: { questionId: ContinuityCriterionId; rating: 1 | 2 }[];
}

/** Uses the UCCMM continuity plan (resilience-1) and backup arrangements (resilience-4) ratings only. */
export function assessContinuityEvidence(responses?: Readonly<AssessmentResponses>): ContinuityEvidence {
  const lowRatedCriteria: ContinuityEvidence['lowRatedCriteria'] = [];
  let availableRatings = 0;
  for (const questionId of continuityCriteria) {
    const rating = responses?.[questionId];
    if (rating === undefined || !Number.isInteger(rating) || rating < 1 || rating > 5) continue;
    availableRatings++;
    if (rating === 1 || rating === 2) lowRatedCriteria.push({ questionId, rating });
  }
  const availability = availableRatings === 0 ? 'unavailable' : availableRatings < continuityCriteria.length ? 'partial' : 'available';
  return { availability, lowRatedCriteria };
}

export interface RecommendationContent {
  id: string;
  dimensionId: string;
  /** Applies to a dimension whose level is at or below this level (tiers are exclusive, see selectTier). */
  maxLevel: MaturityLevel;
  weakness: string;
  action: string;
  benefit: string;
}

export interface Recommendation extends RecommendationContent {
  dimensionName: string;
  scorePercentage: number;
  maturityLevel: MaturityLevel;
  targetPercentage: number | undefined;
  gap: number | undefined;
  priority: RecommendationPriority;
  priorityBasis: RecommendationPriorityBasis;
  /** Undefined in the highest band: improve within Optimising rather than naming a higher level. */
  nextLevel: MaturityLevel | undefined;
  /** Distance to the inclusive upper bound of the current band; reaching the next band requires exceeding it. */
  pointsToNextLevel: number | undefined;
  /** Present on resilience recommendations; private free-text notes are never read or returned. */
  continuityEvidence?: ContinuityEvidence;
}

/**
 * DRAFT CONTENT. Derived from the six dimension definitions, the 30 criteria and the
 * examples in Report 3.5.6. It has not been through the Delphi review (Objective 3)
 * and must be approved before it is presented to organisations as validated advice.
 */
export const recommendationContentStatus = 'draft' as const;

export const recommendationLibrary: readonly RecommendationContent[] = [
  {
    id: 'leadership-foundation', dimensionId: 'leadership', maxLevel: 'Developing',
    weakness: 'Executive sponsorship and ownership of change management are informal or unassigned.',
    action: 'Name an executive sponsor, assign a change management lead, and set aside a change management budget that is separate from technical costs.',
    benefit: 'Clear ownership and funding stop change work from being dropped when the technical schedule is under pressure.',
  },
  {
    id: 'leadership-structure', dimensionId: 'leadership', maxLevel: 'Defined',
    weakness: 'Governance exists but is not consistently tied to decisions or to organisational strategy.',
    action: 'Set up a steering group with a fixed meeting cadence and a documented escalation path for change issues, and record how the ERP objectives support organisational strategy.',
    benefit: 'Change-related issues are resolved quickly, and leaders can show how the ERP serves strategic goals.',
  },
  {
    id: 'leadership-optimise', dimensionId: 'leadership', maxLevel: 'Managed',
    weakness: 'Leadership oversight is not yet driven by measures.',
    action: 'Report change readiness and adoption indicators to the steering group each cycle, and use them to adjust sponsor messaging and budget.',
    benefit: 'Leadership decisions respond to evidence, which sustains support after go-live.',
  },
  {
    id: 'communication-foundation', dimensionId: 'communication', maxLevel: 'Developing',
    weakness: 'Affected stakeholders are not systematically identified and communication is ad hoc.',
    action: 'List every affected user group and publish a communication plan that explains why the ERP is being introduced, what changes for each group, and when.',
    benefit: 'Users hear the reason for the change from the organisation first, which reduces resistance driven by rumour.',
  },
  {
    id: 'communication-structure', dimensionId: 'communication', maxLevel: 'Defined',
    weakness: 'Communication is planned but not tailored to roles or open to two-way feedback.',
    action: 'Write role-specific messages for each department, and open a defined channel for questions and concerns with a stated response time.',
    benefit: 'Concerns surface early, and users see that their input is acted on.',
  },
  {
    id: 'communication-optimise', dimensionId: 'communication', maxLevel: 'Managed',
    weakness: 'Stakeholder feedback is collected but not analysed for patterns.',
    action: 'Track concerns raised and resolved by department, and review communication effectiveness at each project milestone.',
    benefit: 'Communication effort goes to the groups that need it most.',
  },
  {
    id: 'requirements-foundation', dimensionId: 'requirements', maxLevel: 'Developing',
    weakness: 'Requirements are captured informally and changes to them are not controlled.',
    action: 'Document requirements for each business process, have business owners sign them off, and introduce a written change-request form.',
    benefit: 'The ERP configuration reflects real workflows, which reduces rework after go-live.',
  },
  {
    id: 'requirements-structure', dimensionId: 'requirements', maxLevel: 'Defined',
    weakness: 'A change process exists but impact assessment and traceability are inconsistent.',
    action: 'Require an impact assessment before any requirements change is approved, and trace each configuration decision to a documented requirement.',
    benefit: 'Scope decisions are defensible, and configuration errors are easier to diagnose.',
  },
  {
    id: 'requirements-optimise', dimensionId: 'requirements', maxLevel: 'Managed',
    weakness: 'Process alignment is not reviewed after deployment.',
    action: 'Compare live ERP processes with documented workflows after go-live, and feed the gaps back into the requirements register.',
    benefit: 'The ERP keeps matching how the business actually works.',
  },
  {
    id: 'readiness-foundation', dimensionId: 'readiness', maxLevel: 'Developing',
    weakness: 'Organisational and user readiness has not been formally assessed.',
    action: 'Run a formal readiness assessment before the next implementation phase, covering resources, user understanding of project scope, and expected sources of resistance.',
    benefit: 'Risks to adoption are found while there is still time to address them.',
  },
  {
    id: 'readiness-structure', dimensionId: 'readiness', maxLevel: 'Defined',
    weakness: 'Readiness is assessed but users are not involved in early planning.',
    action: 'Involve representatives from each affected department in planning and design workshops, and repeat the readiness check before go-live.',
    benefit: 'Users who help shape the change are better prepared and more likely to support it.',
  },
  {
    id: 'readiness-optimise', dimensionId: 'readiness', maxLevel: 'Managed',
    weakness: 'Readiness is not tracked as a measure over time.',
    action: 'Track readiness indicators such as user confidence and understanding by department, and act on groups that fall behind.',
    benefit: 'Support is targeted before go-live instead of after adoption problems appear.',
  },
  {
    id: 'training-foundation', dimensionId: 'training', maxLevel: 'Developing',
    weakness: 'Training is generic and support after go-live is unplanned.',
    action: 'Run a training needs analysis, build role-based training content, and set up a support channel with a defined response time before go-live.',
    benefit: 'Users can do their actual jobs in the new system from the first week.',
  },
  {
    id: 'training-structure', dimensionId: 'training', maxLevel: 'Defined',
    weakness: 'Training exists but is not blended, repeated, or tested with users.',
    action: 'Provide blended learning materials that stay available after sessions end, schedule refresher training after go-live, and include users in pre-go-live testing.',
    benefit: 'Skills are retained, and usability problems are caught before they affect operations.',
  },
  {
    id: 'training-optimise', dimensionId: 'training', maxLevel: 'Managed',
    weakness: 'The effectiveness of training and support is not measured.',
    action: 'Measure training completion, user confidence, support response times and recurring workarounds, and use the results to revise training and configuration.',
    benefit: 'Training and support improve continuously, and workarounds are removed at the source.',
  },
  {
    id: 'resilience-foundation', dimensionId: 'resilience', maxLevel: 'Developing',
    weakness: 'A low resilience score suggests reviewing continuity planning for power and connectivity disruptions.',
    action: 'Document an outage plan: arrange backup power for critical implementation activities, provide downloadable training materials, and define procedures for temporary system unavailability.',
    benefit: 'Implementation and training continue through outages instead of stalling.',
  },
  {
    id: 'resilience-structure', dimensionId: 'resilience', maxLevel: 'Defined',
    weakness: 'The resilience score suggests reviewing alternative support channels and how lessons are recorded.',
    action: 'Add alternative communication channels and scheduled in-person support sessions, and hold a documented lessons-learned review at each project phase.',
    benefit: 'Support reaches users who are offline, and the project learns from each disruption.',
  },
  {
    id: 'resilience-optimise', dimensionId: 'resilience', maxLevel: 'Managed',
    weakness: 'The resilience score suggests reviewing whether maturity checks routinely inform improvement plans.',
    action: 'Reassess change management maturity on a fixed schedule and use each result to plan the next set of improvement actions.',
    benefit: 'Improvement becomes a routine practice instead of a one-time exercise.',
  },
  {
    id: 'leadership-sustain', dimensionId: 'leadership', maxLevel: 'Optimising',
    weakness: 'The leadership score is below the set target within Optimising.',
    action: 'Review the lowest-rated leadership criteria with the steering group and assign an owner and measure for each improvement.',
    benefit: 'Leaders can verify whether changes close the remaining gap.',
  },
  {
    id: 'communication-sustain', dimensionId: 'communication', maxLevel: 'Optimising',
    weakness: 'The communication score is below the set target within Optimising.',
    action: 'Use feedback by department to find groups with unresolved concerns and test more effective ways to reach them.',
    benefit: 'Communication improves for groups not yet well served by existing channels.',
  },
  {
    id: 'requirements-sustain', dimensionId: 'requirements', maxLevel: 'Optimising',
    weakness: 'The requirements score is below the set target within Optimising.',
    action: 'Audit a sample of recent configuration changes for traceability, business-owner approval and impact assessment; correct recurring exceptions.',
    benefit: 'Controls hold up in practice, including for changes made after go-live.',
  },
  {
    id: 'readiness-sustain', dimensionId: 'readiness', maxLevel: 'Optimising',
    weakness: 'The readiness score is below the set target within Optimising.',
    action: 'Check readiness indicators for groups still reporting low confidence, try targeted support and reassess those groups.',
    benefit: 'Strong aggregate readiness is supported by improvements in the groups most in need of help.',
  },
  {
    id: 'training-sustain', dimensionId: 'training', maxLevel: 'Optimising',
    weakness: 'The training score is below the set target within Optimising.',
    action: 'Review recurring support requests by role and revise the learning materials or support procedures that would prevent them.',
    benefit: 'Training and support improve where users still encounter friction.',
  },
  {
    id: 'resilience-sustain', dimensionId: 'resilience', maxLevel: 'Optimising',
    weakness: 'The resilience score is below the set target within Optimising.',
    action: 'Rehearse recovery for critical ERP implementation activities, close issues found in the drill and verify the fixes in the next exercise.',
    benefit: 'Continuity arrangements are checked in practice and improve over time.',
  },
];

/** Fallback roadmap score range (README: 10% to 80%); actionable gaps or ratings can override it. */
export const defaultRecommendationRange = { minScore: 10, maxScore: 80 } as const;

function maturityPriority(level: MaturityLevel): RecommendationPriority {
  const index = levelIndex(level);
  if (index <= 1) return 'high';
  return index === 2 ? 'medium' : 'low';
}

/** Picks the single tier whose maxLevel is the lowest one that still covers the dimension's level. */
function selectTier(entries: readonly RecommendationContent[], level: MaturityLevel): RecommendationContent[] {
  const covering = entries.filter((entry) => levelIndex(entry.maxLevel) >= levelIndex(level));
  if (covering.length === 0) return [];
  const lowest = Math.min(...covering.map((entry) => levelIndex(entry.maxLevel)));
  return covering.filter((entry) => levelIndex(entry.maxLevel) === lowest);
}

const priorityRank: Record<RecommendationPriority, number> = { high: 0, medium: 1, low: 2 };

const continuityGuidance = {
  'resilience-1': {
    weakness: 'The continuity plan was rated not in place or rarely in place.',
    action: 'Document how to continue critical ERP implementation work during power or internet disruption, including offline materials, alternative support channels and recovery procedures.',
  },
  'resilience-4': {
    weakness: 'Backup arrangements were rated not in place or rarely in place.',
    action: 'Assign owners for backup power and connectivity arrangements and test that critical ERP activities can continue during a disruption.',
  },
} as const;

function refineContinuity(evidence: ContinuityEvidence | undefined): Partial<Pick<RecommendationContent, 'weakness' | 'action' | 'benefit'>> {
  if (!evidence?.lowRatedCriteria.length) return {};
  const guidance = evidence.lowRatedCriteria.map(({ questionId }) => continuityGuidance[questionId]);
  return {
    weakness: guidance.map(({ weakness }) => weakness).join(' '),
    action: guidance.map(({ action }) => action).join(' '),
    benefit: 'Critical ERP implementation activities are less likely to stall if power or internet access is interrupted.',
  };
}

export interface RecommendationOptions {
  minScore?: number;
  maxScore?: number;
  library?: readonly RecommendationContent[];
  /** Use the submitted assessment's target snapshot, not the current organisation settings. */
  targets?: MaturityTargets;
  /** Optional UCCMM criterion ratings; do not supply private notes. */
  responses?: Readonly<AssessmentResponses>;
}

/**
 * Positive target gaps lead, largest first, even outside the fallback range. Met targets can
 * retain low-priority roadmap advice; unset targets use maturity-based priority instead.
 * Low continuity ratings can trigger resilience advice independently of the aggregate score.
 */
export function generateRecommendations(
  dimensionScores: readonly DimensionScore[],
  bands: readonly MaturityBand[],
  options: RecommendationOptions = {},
): Recommendation[] {
  const { minScore = defaultRecommendationRange.minScore, maxScore = defaultRecommendationRange.maxScore,
    library = recommendationLibrary, targets, responses } = options;
  const continuityEvidence = assessContinuityEvidence(responses);

  const recommendations = calculateDimensionGaps(dimensionScores, targets).flatMap((dimension): Recommendation[] => {
    const { dimensionId, dimensionName, scorePercentage, maturityLevel, targetPercentage, gap, priority: targetPriority } = dimension;
    const evidence = dimensionId === 'resilience' ? continuityEvidence : undefined;
    const refinement = refineContinuity(evidence);
    const nextLevel: MaturityLevel | undefined = levelOrder.at(levelIndex(maturityLevel) + 1);
    const isFallbackRoadmap = nextLevel && scorePercentage >= minScore && scorePercentage <= maxScore;
    if (!targetPriority && !evidence?.lowRatedCriteria.length && !isFallbackRoadmap) return [];

    const currentBand = bands.find((band) => band.level === maturityLevel);
    const pointsToNextLevel = nextLevel && currentBand ? pointsShortOf(currentBand.upperBound, scorePercentage) : undefined;
    const matches = selectTier(library.filter((entry) => entry.dimensionId === dimensionId), maturityLevel);
    return matches.map((entry) => ({
      ...entry,
      ...refinement,
      dimensionName,
      scorePercentage,
      maturityLevel,
      targetPercentage,
      gap,
      priority: targetPriority ?? (gap === 0 ? 'low' : maturityPriority(maturityLevel)),
      priorityBasis: targetPriority ? 'target-gap' : gap === 0 ? 'target-met' : 'maturity-level',
      nextLevel,
      pointsToNextLevel,
      ...(evidence ? { continuityEvidence: evidence } : {}),
    }));
  });

  return recommendations.sort((first, second) => (second.gap ?? 0) - (first.gap ?? 0)
    || priorityRank[first.priority] - priorityRank[second.priority] || compareActualThenId(first, second) || compareIds(first.id, second.id));
}

/** Dimensions from lowest score to highest; equal scores keep their original order (Report TC-R1). */
export function rankDimensions<T extends Pick<DimensionScore, 'scorePercentage'>>(scores: readonly T[]): T[] {
  return scores.map((score, order) => ({ score, order }))
    .sort((first, second) => first.score.scorePercentage - second.score.scorePercentage || first.order - second.order)
    .map(({ score }) => score);
}

export type QualificationSeverity = 'none' | 'weak' | 'critical';

export interface OverallQualification {
  severity: QualificationSeverity;
  weakestDimension: DimensionScore;
  strongestDimension: DimensionScore;
  /** Largest positive gap, which need not belong to the lowest-scoring dimension. */
  largestTargetGap: DimensionGap | undefined;
  label: string;
}

/** Report 3.5.5: a high-priority target gap qualifies the overall result as critical. Without a
 * positive gap, describe weaknesses relative to the overall level without implying a target miss. */
export function qualifyOverallResult(
  summary: Pick<AssessmentScoreSummary, 'dimensionScores' | 'overallMaturityLevel'> & { targetSnapshot?: MaturityTargets },
  targets: MaturityTargets = summary.targetSnapshot ?? {},
): OverallQualification {
  if (summary.dimensionScores.length === 0) throw new Error('At least one dimension score is required.');
  const ranked = [...summary.dimensionScores].sort(compareActualThenId);
  const weakestDimension = ranked[0];
  const strongestDimension = ranked[ranked.length - 1];
  const largestTargetGap = calculateDimensionGaps(summary.dimensionScores, targets).find(({ priority }) => priority !== undefined);
  const result = { weakestDimension, strongestDimension, largestTargetGap };
  const level = summary.overallMaturityLevel;
  if (largestTargetGap) {
    const critical = largestTargetGap.priority === 'high';
    return {
      ...result,
      severity: critical ? 'critical' : 'weak',
      label: `${level} with a ${critical ? 'critical target gap' : 'target shortfall'} in ${largestTargetGap.dimensionName}`,
    };
  }
  const levelsBelow = levelIndex(level) - levelIndex(weakestDimension.maturityLevel);
  if (levelsBelow > 0) {
    const comparison = levelsBelow >= 2 ? 'with a low score in' : 'weakest in';
    return { ...result, severity: 'weak', label: `${level} overall, ${comparison} ${weakestDimension.dimensionName}` };
  }
  return { ...result, severity: 'none', label: level };
}
