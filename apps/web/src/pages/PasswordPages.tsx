import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { requestPasswordReset, updatePassword } from '../services/auth-service';
import { useAuth } from '../auth/AuthProvider';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await requestPasswordReset(email);
      setMessage('If an account uses this email, we have sent a password reset link.');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'We could not send a reset link. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return <main className="auth-content"><form className="auth-card" onSubmit={(event) => void submit(event)}>
    <div className="auth-intro"><p className="eyebrow">Account recovery</p><h1>Reset your password</h1><p>Enter your Admin account email and we’ll send a reset link.</p></div>
    <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    {message && <p role="status" className="success-message">{message}</p>}{error && <p role="alert" className="form-error">{error}</p>}
    <button className="login-button" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
    <p className="auth-footnote"><Link to="/sign-in">Back to sign in</Link></p>
  </form></main>;
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    if (password.length < 12) { setError('Use at least 12 characters.'); return; }
    if (password !== confirmation) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      await updatePassword(password);
      await refresh();
      navigate('/admin', { replace: true });
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'This reset link may have expired. Request another one.');
    } finally {
      setBusy(false);
    }
  };

  return <main className="auth-content"><form className="auth-card" onSubmit={(event) => void submit(event)}>
    <div className="auth-intro"><p className="eyebrow">Account recovery</p><h1>Choose a new password</h1></div>
    <label>New password<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    <label>Confirm password<input type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
    {error && <p role="alert" className="form-error">{error}</p>}
    <button className="login-button" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
  </form></main>;
}
