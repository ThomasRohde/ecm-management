import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getApiErrorMessage } from '../api/client';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        if (!displayName.trim()) {
          setError('Display name is required');
          setIsSubmitting(false);
          return;
        }
        await register(email, displayName, password);
      }
      navigate('/');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Authentication failed. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  function toggleMode() {
    setMode(mode === 'login' ? 'register' : 'login');
    setError('');
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className="sapphire-text sapphire-text--heading-md">
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </h1>
          <p className="sapphire-text sapphire-text--body-md sapphire-text--secondary">
            {mode === 'login'
              ? 'Enter your credentials to access the ECM Platform'
              : 'Register a new account for local development'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {mode === 'register' && (
            <div className={styles.field}>
              <label htmlFor="displayName" className={styles.label}>
                Display name
              </label>
              <input
                id="displayName"
                type="text"
                className="sapphire-text-field"
                value={displayName}
                onChange={(e) => { setDisplayName(e.target.value); }}
                required
                autoComplete="name"
              />
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor="email" className={styles.label}>
              Email
            </label>
            <input
              id="email"
              type="email"
              className="sapphire-text-field"
              value={email}
              onChange={(e) => { setEmail(e.target.value); }}
              required
              autoComplete="email"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password" className={styles.label}>
              Password
            </label>
            <input
              id="password"
              type="password"
              className="sapphire-text-field"
              value={password}
              onChange={(e) => { setPassword(e.target.value); }}
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="sapphire-button sapphire-button--primary sapphire-button--md"
            disabled={isSubmitting}
            style={{ width: '100%' }}
          >
            <span className="sapphire-button__content">
              {isSubmitting ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
            </span>
          </button>
        </form>

        <div className={styles.footer}>
          <button
            type="button"
            className="sapphire-button sapphire-button--tertiary sapphire-button--sm"
            onClick={toggleMode}
            disabled={isSubmitting}
            style={{ width: '100%' }}
          >
            <span className="sapphire-button__content">
              {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
