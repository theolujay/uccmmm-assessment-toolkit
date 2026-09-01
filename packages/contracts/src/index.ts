import { z } from 'zod';

export const roleSchema = z.enum(['admin', 'staff']);
export type Role = z.infer<typeof roleSchema>;

export const assessmentStatusSchema = z.enum(['draft', 'in_progress', 'submitted']);
export type AssessmentStatus = z.infer<typeof assessmentStatusSchema>;

export const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});
export type SignInInput = z.infer<typeof signInSchema>;

export interface AssessmentQuestion { id: string; prompt: string; required: boolean; }
export interface AssessmentDimension { id: string; name: string; questions: AssessmentQuestion[]; }
export interface AssessmentTemplate { id: string; name: string; dimensions: AssessmentDimension[]; }

