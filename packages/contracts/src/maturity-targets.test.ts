import { expect, it } from 'vitest';
import { assessmentRecordSchema, assessmentTemplate, createAssessmentRecord, maturityTargetsSchema } from './index';

it('accepts empty and partial maps of uccmm-v1 dimensions to integer percentages from 20 through 100', () => {
  expect(maturityTargetsSchema.parse({})).toEqual({});
  const targets = Object.fromEntries(assessmentTemplate.dimensions.map(({ id }, index) => [id, index % 2 ? 20 : 100]));
  expect(maturityTargetsSchema.parse(targets)).toEqual(targets);
  expect(maturityTargetsSchema.parse({ leadership: 73 })).toEqual({ leadership: 73 });
  for (const invalid of [null, [], { unknown: 70 }, { leadership: 19 }, { leadership: 101 },
    { leadership: 55.5 }, { leadership: '70' }, { leadership: null }, { leadership: undefined }, JSON.parse('{"__proto__":70}')]) {
    expect(maturityTargetsSchema.safeParse(invalid).success).toBe(false);
  }
});

it('defaults legacy records to an empty snapshot and captures a copy of any provided targets', () => {
  const input = {
    id: 'test-record', organisationId: 'test-org', respondentType: 'admin' as const,
    submittedAt: '2026-11-19T12:00:00Z', template: assessmentTemplate,
    responses: Object.fromEntries(assessmentTemplate.dimensions.flatMap(({ questions }) => questions.map(({ id }) => [id, 3]))),
  };
  const targetSnapshot = { leadership: 80 };
  const record = createAssessmentRecord({ ...input, targetSnapshot });
  targetSnapshot.leadership = 95;
  expect(record.targetSnapshot).toEqual({ leadership: 80 });
  expect(Object.isFrozen(record.targetSnapshot)).toBe(true);
  expect(assessmentRecordSchema.parse(record).targetSnapshot).toEqual({ leadership: 80 });
  expect(createAssessmentRecord(input).targetSnapshot).toEqual({});
  expect(assessmentRecordSchema.parse({ ...record, targetSnapshot: undefined }).targetSnapshot).toEqual({});
});
