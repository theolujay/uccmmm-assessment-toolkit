import { z } from 'zod';

export const roleSchema = z.enum(['admin', 'stakeholder']);
export type Role = z.infer<typeof roleSchema>;

export const assessmentStatusSchema = z.enum(['draft', 'in_progress', 'submitted']);
export type AssessmentStatus = z.infer<typeof assessmentStatusSchema>;

export const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const organisationProfileSchema = z.object({
  name: z.string().trim().min(2).max(160),
  sector: z.string().trim().min(2).max(120),
  employeeCount: z.number().int().positive(),
  erpPlatform: z.string().trim().min(2).max(120),
  implementationStage: z.enum(['planning', 'in_progress', 'post_go_live']),
});
export type OrganisationProfile = z.infer<typeof organisationProfileSchema>;

export const adminRegistrationSchema = z.object({
  organisation: organisationProfileSchema,
  fullName: z.string().trim().min(2).max(120),
  email: z.email(),
  password: z.string().min(12).max(128),
  passwordConfirmation: z.string(),
}).refine((input) => input.password === input.passwordConfirmation, {
  path: ['passwordConfirmation'],
  message: 'Passwords do not match.',
});
export type AdminRegistrationInput = z.infer<typeof adminRegistrationSchema>;

export const stakeholderInputSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.email(),
  department: z.string().trim().min(1).max(120),
  jobRole: z.string().trim().min(1).max(120),
});
export type StakeholderInput = z.infer<typeof stakeholderInputSchema>;

export const invitationStatusSchema = z.enum(['pending', 'sent', 'email_failed', 'revoked']);
export const participationStatusSchema = z.enum(['not_started', 'in_progress', 'completed']);
export const stakeholderSchema = stakeholderInputSchema.extend({
  id: z.string().uuid(),
  organizationId: z.string().min(1),
  invitationStatus: invitationStatusSchema,
  assessmentStatus: participationStatusSchema,
  invitedAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
});
export type Stakeholder = z.infer<typeof stakeholderSchema>;

export const participationSummarySchema = z.object({
  invited: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  inProgress: z.number().int().nonnegative(),
  notStarted: z.number().int().nonnegative(),
});
export type ParticipationSummary = z.infer<typeof participationSummarySchema>;

export const maturityLevelSchema = z.enum([
  'Initial',
  'Developing',
  'Defined',
  'Managed',
  'Optimising',
]);
export type MaturityLevel = z.infer<typeof maturityLevelSchema>;

export const maturityBandSchema = z.object({
  level: maturityLevelSchema,
  upperBound: z.number().min(0).max(100),
});
export type MaturityBand = z.infer<typeof maturityBandSchema>;

export const defaultMaturityBands: readonly MaturityBand[] = [
  { level: 'Initial', upperBound: 20 },
  { level: 'Developing', upperBound: 40 },
  { level: 'Defined', upperBound: 60 },
  { level: 'Managed', upperBound: 80 },
  { level: 'Optimising', upperBound: 100 },
];

export const responseOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  weight: z.number().int().min(1).max(5),
});
export type ResponseOption = z.infer<typeof responseOptionSchema>;

export const assessmentQuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  required: z.literal(true),
  isCore: z.literal(true),
  order: z.number().int().positive(),
  options: z.array(responseOptionSchema).length(5),
});
export type AssessmentQuestion = z.infer<typeof assessmentQuestionSchema>;

export const assessmentDimensionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().min(1),
  description: z.string().min(1),
  order: z.number().int().positive(),
  weight: z.number().positive(),
  questions: z.array(assessmentQuestionSchema).length(5),
});
export type AssessmentDimension = z.infer<typeof assessmentDimensionSchema>;

export const assessmentTemplateSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  name: z.string().min(1),
  maturityBands: z.array(maturityBandSchema).length(5).default([...defaultMaturityBands]),
  dimensions: z.array(assessmentDimensionSchema).length(6),
});
export type AssessmentTemplate = z.infer<typeof assessmentTemplateSchema>;

const responseOptions = [
  { id: 'not-in-place', label: 'Not in place', weight: 1 },
  { id: 'rarely-in-place', label: 'Rarely in place', weight: 2 },
  { id: 'partially-in-place', label: 'Partially in place', weight: 3 },
  { id: 'mostly-in-place', label: 'Mostly in place', weight: 4 },
  { id: 'fully-consistently-in-place', label: 'Fully and consistently in place', weight: 5 },
] as const satisfies readonly ResponseOption[];

type DimensionDefinition = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  prompts: readonly string[];
};

const dimensionDefinitions: readonly DimensionDefinition[] = [
  {
    id: 'leadership', name: 'Leadership, Governance & Strategy', shortName: 'Leadership',
    description: 'Examines executive sponsorship, budget allocation, and whether responsibility for change management is clearly assigned and aligned with organisational strategy.',
    prompts: [
      'Senior leaders regularly communicate the purpose and expected benefits of the ERP implementation?',
      'Appropriate decision-making structures exist to address change-related issues during ERP implementation?',
      'Individuals and teams responsible for change management are clearly identified and accountable?',
      'Change management activities have a dedicated budget, separate from technical implementation costs?',
      "ERP implementation objectives are explicitly linked to the organisation's broader strategic goals?",
    ],
  },
  {
    id: 'communication', name: 'Communication and Stakeholder Engagement', shortName: 'Communication',
    description: 'Focuses on structured communication strategies that explain the why behind the change. It covers stakeholder identification, role-specific messaging, and active mechanisms to gather and address user concerns, needs, and expectations.',
    prompts: [
      'Users affected by the ERP implementation were identified before major design decisions were made?',
      'A documented communication plan defines what information reaches which stakeholder groups, and when?',
      'Messaging about the ERP change is tailored to different departments rather than sent as one generic message?',
      'Employees have a defined channel to raise concerns or questions about the ERP change?',
      'User concerns raised during the project are tracked and visibly acted upon?',
    ],
  },
  {
    id: 'requirements', name: 'Requirements and Process Alignment', shortName: 'Requirements',
    description: 'Evaluates how effectively user requirements are captured, documented, and validated. It manages scope decisions, impact assessments, change-request procedures, and decision traceability to ensure the final ERP configuration matches actual business workflows.',
    prompts: [
      'The organisation has a documented procedure for assessing and approving requirements changes?',
      'Changes to ERP configuration are traced back to a documented business requirement?',
      'New ERP processes were checked against existing business processes before go-live?',
      'Requirements are formally signed off by business owners before configuration begins?',
      'The impact of a proposed requirements change is assessed before it is approved?',
    ],
  },
  {
    id: 'readiness', name: 'Organisational and User Readiness', shortName: 'Readiness',
    description: 'Measures whether the organisation conducts formal readiness assessments. It ensures users understand the ERP project’s scope, actively participate in early planning, and are psychologically and structurally prepared for the transition.',
    prompts: [
      'A formal readiness assessment was conducted before the ERP implementation began?',
      'Staff understand why the ERP system is being implemented, not just that it is happening?',
      'Users were given the opportunity to participate in early planning activities?',
      'The organisation assessed whether it had sufficient resources before starting implementation?',
      'Employees report feeling psychologically prepared for the change, not just informed of it?',
    ],
  },
  {
    id: 'training', name: 'Training, Support, and User Experience', shortName: 'Training',
    description: 'Combines training needs analysis, role-based learning content, and blended training materials with post-deployment support. It measures user participation in testing, helpdesk accessibility, support response times, and ongoing tracking of user feedback and system workarounds.',
    prompts: [
      "Training is tailored to users' roles and actual work activities, not delivered generically?",
      'Learning materials remain available to staff after the initial training sessions end?',
      'Refresher training is scheduled after go-live rather than delivered only once?',
      'Users were involved in testing the ERP system before go-live?',
      'A helpdesk or support channel is available and accessible to ERP users, with a defined response time?',
    ],
  },
  {
    id: 'resilience', name: 'Contextual Resilience and Continuous Improvement', shortName: 'Resilience',
    description: 'Addresses the ability to manage ERP change under Nigerian operating conditions and improve practices iteratively.',
    prompts: [
      'The ERP project has a documented plan for managing power or connectivity disruptions?',
      'Lessons learned from the ERP implementation are formally reviewed and documented?',
      'The organisation plans to reassess its change management maturity periodically, not only once?',
      'Backup arrangements exist to keep critical implementation activities running during outages?',
      'Assessment results are used to plan further change management actions?',
    ],
  },
];

export const assessmentTemplate: AssessmentTemplate = {
  id: 'uccmm',
  version: 'uccmm-v1',
  name: 'UCCMM Maturity Assessment',
  maturityBands: [...defaultMaturityBands],
  dimensions: dimensionDefinitions.map((dimension, dimensionIndex) => ({
    id: dimension.id,
    name: dimension.name,
    shortName: dimension.shortName,
    description: dimension.description,
    order: dimensionIndex + 1,
    weight: 1 / dimensionDefinitions.length,
    questions: dimension.prompts.map((prompt, questionIndex) => ({
      id: `${dimension.id}-${questionIndex + 1}`,
      prompt,
      required: true,
      isCore: true,
      order: questionIndex + 1,
      options: responseOptions.map((option) => ({ ...option })),
    })),
  })),
};

export const questionCount = assessmentTemplate.dimensions.reduce(
  (count, dimension) => count + dimension.questions.length,
  0,
);

export const assessmentResponseSchema = z.record(z.string(), z.number().int().min(1).max(5));
export type AssessmentResponses = z.infer<typeof assessmentResponseSchema>;

export const evidenceMaxLength = 1000;
const assessmentQuestionIds = new Set(assessmentTemplate.dimensions.flatMap((dimension) => dimension.questions.map((question) => question.id)));
export const assessmentEvidenceSchema = z.record(
  z.string().refine((id) => assessmentQuestionIds.has(id), 'Unknown assessment question.'),
  // Match the textarea's native maxLength, which counts UTF-16 code units.
  z.string().refine((text) => text.length <= evidenceMaxLength, `Evidence must be at most ${evidenceMaxLength} characters.`),
);
export type AssessmentEvidence = z.infer<typeof assessmentEvidenceSchema>;

export const assessmentDraftSchema = z.object({
  id: z.string().min(1), organisationId: z.string().min(1), respondentType: roleSchema,
  respondentKey: z.string().min(1), assessmentVersion: z.string().min(1), responses: assessmentResponseSchema,
  evidence: assessmentEvidenceSchema.default({}),
  activeQuestionId: z.string().min(1), status: z.enum(['draft', 'in_progress']),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export type AssessmentDraft = z.infer<typeof assessmentDraftSchema>;

export const dimensionScoreSchema = z.object({
  dimensionId: z.string().min(1), dimensionName: z.string().min(1), scorePercentage: z.number().min(0).max(100),
  maturityLevel: maturityLevelSchema, itemCount: z.number().int().positive(),
});
export type DimensionScore = z.infer<typeof dimensionScoreSchema>;

export interface AssessmentScoreSummary {
  dimensionScores: DimensionScore[];
  overallScore: number;
  overallMaturityLevel: MaturityLevel;
}

export const assessmentRecordSchema = z.object({
  id: z.string().min(1), organisationId: z.string().min(1), respondentType: roleSchema,
  assessmentVersion: z.string().min(1), submittedAt: z.string().datetime(), responses: assessmentResponseSchema,
  evidence: assessmentEvidenceSchema.default({}),
  templateSnapshot: assessmentTemplateSchema, dimensionScores: z.array(dimensionScoreSchema).length(6),
  overallScore: z.number().min(0).max(100), overallMaturityLevel: maturityLevelSchema,
});
export type AssessmentRecord = z.infer<typeof assessmentRecordSchema>;

const scoreTolerance = 0.000000001;

function normalizeBoundaryPrecision(score: number): number {
  const boundary = [0, 20, 40, 60, 80, 100].find((value) => Math.abs(score - value) < scoreTolerance);
  return boundary ?? score;
}

function assertScore(score: number): void {
  if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error('Scores must be finite percentages between 0 and 100.');
}

function assertResponseValue(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 5) throw new Error('Each response weight must be an integer between 1 and 5.');
}

export function classifyMaturity(score: number, bands: readonly MaturityBand[] = defaultMaturityBands): MaturityLevel {
  assertScore(score);
  const levels = maturityLevelSchema.options;
  if (bands.length !== levels.length || bands.at(-1)?.upperBound !== 100
    || bands.some((band, index) => band.level !== levels[index] || (index > 0 && band.upperBound <= bands[index - 1].upperBound))) {
    throw new Error('Maturity bands must be ordered, non-overlapping, and end at 100%.');
  }
  const normalizedScore = normalizeBoundaryPrecision(score);
  const orderedBands = [...bands].sort((first, second) => first.upperBound - second.upperBound);
  const band = orderedBands.find((candidate) => normalizedScore <= candidate.upperBound);
  if (!band) throw new Error('No maturity band matches this score.');
  return band.level;
}

export function calculateDimensionScore(values: readonly number[]): number {
  if (values.length === 0) throw new Error('A dimension must contain at least one response.');
  values.forEach(assertResponseValue);
  return (values.reduce((sum, value) => sum + value, 0) / (5 * values.length)) * 100;
}

export function validateDimensionWeights(dimensions: readonly Pick<AssessmentDimension, 'weight'>[]): void {
  if (dimensions.length === 0) throw new Error('An assessment requires at least one dimension.');
  const weightTotal = dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  if (Math.abs(weightTotal - 1) > scoreTolerance) throw new Error('Dimension weights must total 1.0.');
}

export function calculateAssessmentScores(template: AssessmentTemplate, responses: AssessmentResponses): AssessmentScoreSummary {
  assessmentTemplateSchema.parse(template);
  assessmentResponseSchema.parse(responses);
  validateDimensionWeights(template.dimensions);
  const expectedQuestionIds = new Set(template.dimensions.flatMap((dimension) => dimension.questions.map((question) => question.id)));
  const missingQuestionIds = [...expectedQuestionIds].filter((questionId) => responses[questionId] === undefined);
  if (missingQuestionIds.length > 0) throw new Error(`Cannot calculate an incomplete assessment. Missing ${missingQuestionIds.length} response(s).`);
  if (Object.keys(responses).some((questionId) => !expectedQuestionIds.has(questionId))) throw new Error('Assessment responses contain an unknown question.');

  const dimensionScores = template.dimensions.map((dimension) => {
    const scorePercentage = calculateDimensionScore(dimension.questions.map((question) => responses[question.id]));
    return { dimensionId: dimension.id, dimensionName: dimension.name, scorePercentage, maturityLevel: classifyMaturity(scorePercentage, template.maturityBands), itemCount: dimension.questions.length };
  });
  const configuredWeightTotal = template.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  const overallScore = dimensionScores.reduce((sum, dimensionScore, index) => sum + template.dimensions[index].weight * dimensionScore.scorePercentage, 0) / configuredWeightTotal;
  const normalizedOverallScore = normalizeBoundaryPrecision(overallScore);
  return { dimensionScores, overallScore: normalizedOverallScore, overallMaturityLevel: classifyMaturity(normalizedOverallScore, template.maturityBands) };
}

function freezeRecursively<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach((child) => freezeRecursively(child));
  }
  return value;
}

export function createAssessmentRecord(input: {
  id: string; organisationId: string; respondentType: Role; submittedAt: string;
  template: AssessmentTemplate; responses: AssessmentResponses; evidence?: AssessmentEvidence;
}): AssessmentRecord {
  const scoreSummary = calculateAssessmentScores(input.template, input.responses);
  return freezeRecursively(assessmentRecordSchema.parse({
    id: input.id, organisationId: input.organisationId, respondentType: input.respondentType,
    assessmentVersion: input.template.version, submittedAt: input.submittedAt,
    responses: structuredClone(input.responses), evidence: structuredClone(input.evidence),
    templateSnapshot: structuredClone(input.template), ...scoreSummary,
  }));
}
