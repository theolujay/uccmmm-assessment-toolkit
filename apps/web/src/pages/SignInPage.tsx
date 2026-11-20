import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signInSchema, type Role, type SignInInput } from '@assessment/contracts';
import { useAuth } from '../auth/AuthProvider';
import { signIn } from '../services/auth-service';

const asset = (name: string) => `/assets/${name}`;

export function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const [userType, setUserType] = useState<Role>('stakeholder');
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const submit = async (input: SignInInput) => {
    setSubmitError(undefined);
    try {
      const identity = await signIn(input.email, input.password, userType);
      await refresh();
      const requestedPath = (location.state as { from?: string } | null)?.from;
      navigate(requestedPath ?? (identity.role === 'admin' ? '/admin' : '/dashboard'), { replace: true });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'We could not sign you in. Please try again.');
    }
  };

  return <main className="auth-layout">
    <section className="auth-banner">
      <img className="banner-curve" src={asset('ellipse.svg')} alt="" />
      <div className="banner-text"><h1>User-Centred Change Management Maturity Model Assessment Toolkit</h1><p>The UC-CMMM Toolkit helps IT leaders assess organisational change management maturity and gives employees a personal readiness score.</p></div>
      <img className="product-preview" src={asset('assessment-preview.svg')} alt="Fictional maturity profile: 61.33% overall (Managed), with resilience 32 percentage points below its target." />
    </section>
    <section className="auth-content">
      <form className="auth-card" onSubmit={handleSubmit(submit)}>
        <div className="auth-intro"><h2>Welcome back!</h2><p>Enter your details to continue</p></div>
        <fieldset className="user-type"><legend>Select user type</legend><div>
          <button type="button" aria-pressed={userType === 'admin'} className={userType === 'admin' ? 'type-card selected' : 'type-card'} onClick={() => setUserType('admin')}><img src={asset('building.svg')} alt="" /><span>Admin</span></button>
          <button type="button" aria-pressed={userType === 'stakeholder'} className={userType === 'stakeholder' ? 'type-card selected' : 'type-card'} onClick={() => setUserType('stakeholder')}><img src={asset('user-circle.svg')} alt="" /><span>Stakeholder</span></button>
        </div></fieldset>
        <hr />
        <label>Email<div className="input-wrap"><img src={asset('mail.svg')} alt="" /><input type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} /></div>{errors.email && <small>{errors.email.message}</small>}</label>
        <label>{userType === 'admin' ? 'Password' : 'Passcode'}<div className="input-wrap"><img src={asset('lock.svg')} alt="" /><input type={showPassword ? 'text' : 'password'} autoComplete={userType === 'admin' ? 'current-password' : 'one-time-code'} aria-invalid={!!errors.password} {...register('password')} /><button type="button" className="icon-button" aria-label={showPassword ? 'Hide passcode' : 'Show passcode'} onClick={() => setShowPassword((value) => !value)}><img src={asset('eye-off.svg')} alt="" /></button></div>{errors.password && <small>{errors.password.message}</small>}</label>
        {userType === 'admin' && <div className="auth-links"><Link to="/forgot-password">Forgot password?</Link><Link to="/sign-up">Set up your organisation</Link></div>}
        {submitError && <p className="form-error" role="alert">{submitError}</p>}
        <button className="login-button" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Log in'}</button>
      </form>
    </section>
  </main>;
}
