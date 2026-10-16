import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminRegistrationSchema, organisationProfileSchema, type OrganisationProfile } from '@assessment/contracts';
import { useAuth } from '../auth/AuthProvider';
import { registerAdmin } from '../services/auth-service';

type RegistrationFields = Omit<OrganisationProfile, 'employeeCount'> & { employeeCount: string };

export function SignUpPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [organisation, setOrganisation] = useState<OrganisationProfile>();
  const [error, setError] = useState<string>();
  const [confirmationSent, setConfirmationSent] = useState(false);

  const continueToAdmin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget).entries()) as RegistrationFields;
    const parsed = organisationProfileSchema.safeParse({ ...fields, employeeCount: Number(fields.employeeCount) });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Complete all organisation details.');
      return;
    }
    setOrganisation(parsed.data);
    setError(undefined);
    setStep(2);
  };

  const finishRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organisation) return;
    const fields = Object.fromEntries(new FormData(event.currentTarget).entries());
    const parsed = adminRegistrationSchema.safeParse({
      organisation,
      fullName: fields.fullName,
      email: fields.email,
      password: fields.password,
      passwordConfirmation: fields.passwordConfirmation,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your details and try again.');
      return;
    }
    setError(undefined);
    try {
      const needsConfirmation = await registerAdmin(parsed.data);
      if (needsConfirmation) {
        setConfirmationSent(true);
        return;
      }
      await refresh();
      navigate('/admin', { replace: true });
    } catch (registrationError) {
      setError(registrationError instanceof Error ? registrationError.message : 'We could not create your organisation. Please try again.');
    }
  };

  if (confirmationSent) return <main className="auth-content"><section className="auth-card empty-state" aria-live="polite">
    <p className="eyebrow">Check your email</p><h1>Confirm your account</h1><p>Use the confirmation link we sent to finish creating your organisation account.</p><Link className="button" to="/sign-in">Return to sign in</Link>
  </section></main>;

  return <main className="auth-content registration-content">
    <header className="registration-brand">UC-CMMM ASSESSMENT TOOLKIT</header>
    <form className="auth-card registration-card" onSubmit={step === 1 ? continueToAdmin : finishRegistration}>
    <div className="auth-intro"><p className="eyebrow">Organisation setup · Step {step} of 2</p><h1>{step === 1 ? 'Tell us about your organisation' : 'Create your Admin account'}</h1><p>{step === 1 ? 'These details help us set up your assessment workspace.' : 'Your Admin account will own this organisation workspace.'}</p></div>
    {step === 1 ? <>
      <label>Organisation name<input name="name" required minLength={2} autoComplete="organization" /></label>
      <div className="registration-grid-row">
        <label>Sector<select name="sector" defaultValue="" required><option value="" disabled>Select sector</option><option>Agriculture</option><option>Education</option><option>Financial services</option><option>Healthcare</option><option>Logistics</option><option>Manufacturing</option><option>Public sector</option><option>Retail</option><option>Telecommunications</option><option>Other</option></select></label>
        <label>Number of employees<input name="employeeCount" type="number" min="1" required placeholder="e.g. 250" /></label>
      </div>
      <label>ERP platform<input name="erpPlatform" required /></label>
      <label>Implementation stage<select name="implementationStage" required defaultValue=""><option value="" disabled>Select a stage</option><option value="planning">Planning</option><option value="in_progress">In progress</option><option value="post_go_live">Post-Go-Live</option></select></label>
      <button className="login-button">Continue</button>
    </> : <>
      <label>Full name<input name="fullName" autoComplete="name" required minLength={2} /></label>
      <label>Email address<input name="email" type="email" autoComplete="email" required /></label>
      <label>Password<input name="password" type="password" autoComplete="new-password" minLength={12} required /><small>Use at least 12 characters.</small></label>
      <label>Confirm password<input name="passwordConfirmation" type="password" autoComplete="new-password" required /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="question-actions"><button type="button" className="button secondary" onClick={() => { setStep(1); setError(undefined); }}>Back</button><button className="button">Create organisation</button></div>
    </>}
    {step === 1 && error && <p className="form-error" role="alert">{error}</p>}
    <p className="auth-footnote">Already have an account? <Link to="/sign-in">Log in</Link></p>
    </form>
  </main>;
}
