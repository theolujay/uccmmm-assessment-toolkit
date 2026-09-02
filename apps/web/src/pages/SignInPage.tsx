import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signInSchema, type SignInInput } from '@assessment/contracts';
import { useNavigate } from 'react-router-dom';

export function SignInPage() {
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SignInInput>({ resolver: zodResolver(signInSchema) });
  const submit = async (_data: SignInInput) => { void _data; await new Promise((resolve) => setTimeout(resolve, 250)); navigate('/dashboard'); };
  return <main className="auth-layout"><section className="auth-banner"><p className="display-title">User-Centred Change Management Maturity Model Assessment Toolkit</p><p className="banner-copy">The UC-CMMM Toolkit helps IT leaders assess organisational change management maturity and gives employees a personal readiness score.</p></section><section className="auth-content"><form className="auth-card" onSubmit={handleSubmit(submit)}><div><h1>Welcome back!</h1><p>Enter your details to continue</p></div><label>Email<input type="email" autoComplete="email" {...register('email')} />{errors.email && <small>{errors.email.message}</small>}</label><label>Passcode<input type="password" autoComplete="current-password" {...register('password')} />{errors.password && <small>{errors.password.message}</small>}</label><button disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Sign in'}</button></form></section></main>;
}
