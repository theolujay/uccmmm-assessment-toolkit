import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

export function AppShell() {
  const navigate = useNavigate();
  const { user, signOut, offlineRecovery, disableOfflineRecovery, refresh } = useAuth();
  const [retryBusy, setRetryBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState<string>();
  const role = user?.role ?? 'stakeholder';
  const links = role === 'admin'
    ? [['/admin', 'Dashboard'], ['/stakeholders', 'Stakeholder Assessment'], ['/assessment', 'Assessment'], ['/recommendations', 'Recommendations']]
    : [['/dashboard', 'Home'], ['/assessment', 'Assessment'], ['/results', 'My Results']];

  const logout = async () => {
    setLogoutBusy(true);
    setLogoutError(undefined);
    try {
      await signOut();
      navigate('/sign-in', { replace: true });
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'Could not log out. Please try again.');
    } finally {
      setLogoutBusy(false);
    }
  };

  const retry = async () => {
    setRetryBusy(true);
    try {
      await refresh();
    } finally {
      setRetryBusy(false);
    }
  };

  return <div className="app-shell">
    <header className="app-header">
      <strong className="brand">UCCMM ASSESSMENT TOOLKIT</strong>
      {offlineRecovery ? <div className="user-menu-wrap">
        <button className="button secondary" onClick={disableOfflineRecovery}>Forget this device</button>
      </div> : <><nav className="top-nav" aria-label="Main navigation">{links.map(([to, label]) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : ''}>{label}</NavLink>)}</nav>
      <div className="user-menu-wrap">
        <button className="user-menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
          <span aria-hidden="true">{(user?.fullName || user?.email || 'U').slice(0, 2).toUpperCase()}</span>
          <span className="user-copy"><b>{user?.fullName || (role === 'admin' ? 'Admin' : 'Stakeholder')}</b><small>{user?.email}</small></span>⌄
        </button>
        {menuOpen && <div className="profile-menu" role="menu">
          {role === 'admin' && <button role="menuitem" onClick={() => { setMenuOpen(false); navigate('/settings'); }}>Account settings</button>}
          <button role="menuitem" onClick={() => { setMenuOpen(false); setLogoutOpen(true); }}>Log out</button>
        </div>}
      </div></>}
    </header>
    <main className="shell-content">
      {offlineRecovery && <div className="offline-note">
        <p role="status">Offline assessment recovery. Your session must be verified online before you can sync or submit.</p>
        <button className="button secondary" disabled={retryBusy} onClick={() => void retry()}>{retryBusy ? 'Checking session…' : 'Retry connection'}</button>
      </div>}
      <Outlet />
    </main>
    {!offlineRecovery && logoutOpen && <div className="modal-backdrop logout-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !logoutBusy) setLogoutOpen(false); }}>
      <section className="logout-modal" role="dialog" aria-modal="true" aria-labelledby="logout-heading" aria-describedby="logout-description">
        <span className="logout-icon" aria-hidden="true">↪</span>
        <h2 id="logout-heading">Log out?</h2>
        <p id="logout-description">You are about to log out of the platform. Do you want to proceed?</p>
        {logoutError && <p className="form-error" role="alert">{logoutError}</p>}
        <div className="logout-actions"><button className="button secondary" disabled={logoutBusy} onClick={() => setLogoutOpen(false)}>Cancel</button><button className="button logout-confirm" disabled={logoutBusy} onClick={() => void logout()}>{logoutBusy ? 'Logging out…' : 'Yes, log out'}</button></div>
      </section>
    </div>}
  </div>;
}
