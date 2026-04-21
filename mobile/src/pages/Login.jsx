import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogIn, User, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.jsx';
import { t, setLanguage, getLanguage } from '../utils/i18n.js';

const AlAssileLogo = ({ size = 64 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="30" fill="url(#logoGradientMobile)" />
    <ellipse cx="32" cy="36" rx="12" ry="16" fill="#8B4513" />
    <ellipse cx="32" cy="36" rx="10" ry="14" fill="#A0522D" />
    <ellipse cx="29" cy="33" rx="4" ry="8" fill="#CD853F" opacity="0.6" />
    <path d="M32 8 C32 8 24 16 24 20 C24 24 28 22 32 18 C36 22 40 24 40 20 C40 16 32 8 32 8Z" fill="#228B22" />
    <path d="M32 10 C32 10 26 16 26 19 C26 22 29 21 32 18 C35 21 38 22 38 19 C38 16 32 10 32 10Z" fill="#32CD32" />
    <ellipse cx="28" cy="30" rx="3" ry="5" fill="white" opacity="0.2" />
    <defs>
      <linearGradient id="logoGradientMobile" x1="0" y1="0" x2="64" y2="64">
        <stop offset="0%" stopColor="#D4A574" />
        <stop offset="100%" stopColor="#8B6914" />
      </linearGradient>
    </defs>
  </svg>
);

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [lang, setLang] = useState(getLanguage());

  const from = location.state?.from?.pathname || '/';

  // Auto-redirect if already logged in (session remembered)
  // Only on initial mount — prevents redirect loops if API calls return 401
  React.useEffect(() => {
    if (isAuthenticated && from === '/') {
      navigate('/', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleLanguage = () => {
    const next = lang === 'en' ? 'ar' : 'en';
    setLanguage(next);
    setLang(next);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError(t('loginError'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await login(username.trim(), password);
      if (result.success) {
        navigate(from, { replace: true });
      } else {
        setError(result.error || t('invalidCredentials'));
      }
    } catch {
      setError(t('networkError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #0d1108 0%, #080c14 60%)' }}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      {/* Background radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(212,165,116,0.12) 0%, transparent 70%)',
        }}
      />

      {/* Dot grid */}
      <div
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(212,165,116,0.8) 1px, transparent 0)',
          backgroundSize: '28px 28px',
        }}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10 safe-top">
        {/* Logo section */}
        <motion.div
          initial={{ opacity: 0, y: -24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="flex flex-col items-center mb-10"
        >
          <div className="mb-4" style={{ filter: 'drop-shadow(0 0 24px rgba(212,165,116,0.35))' }}>
            <AlAssileLogo size={72} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#D4A574' }}>
            {t('alAssile')}
          </h1>
          <p className="text-sm mt-1 font-medium" style={{ color: '#6b5a3e' }}>
            {t('mobileSales')}
          </p>
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1, ease: 'easeOut' }}
          className="w-full max-w-sm"
        >
          <div
            className="rounded-2xl p-7 relative"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <div className="flex items-start justify-between gap-3 mb-6">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: '#D4A574' }}>
                  {t('welcomeBack')}
                </p>
                <h2 className="text-xl font-bold text-white">{t('signInToContinue')}</h2>
              </div>
              <button
                type="button"
                onClick={toggleLanguage}
                className="flex items-center justify-center w-9 h-9 rounded-xl text-lg touch-manipulation flex-shrink-0 mt-1"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.09)',
                }}
                aria-label={t('toggleLanguage')}
              >
                {lang === 'en' ? '🇩🇿' : '🇬🇧'}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Error message */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm"
                  style={{
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.15)',
                    color: '#f87171',
                  }}
                  role="alert"
                >
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </motion.div>
              )}

              {/* Username */}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider mb-2" style={{ color: '#666' }}>
                  {t('username')}
                </label>
                <div className="relative">
                  <User
                    size={17}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: '#4a5568' }}
                  />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setError(''); }}
                    placeholder={t('enterUsername')}
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="w-full pl-10 pr-4 py-3.5 rounded-xl text-white placeholder-gray-600
                               outline-none transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      fontSize: '16px',
                    }}
                    onFocus={(e) => { e.target.style.borderColor = 'rgba(212,165,116,0.35)'; }}
                    onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider mb-2" style={{ color: '#666' }}>
                  {t('password')}
                </label>
                <div className="relative">
                  <Lock
                    size={17}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: '#4a5568' }}
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(''); }}
                    placeholder={t('enterPassword')}
                    autoComplete="current-password"
                    className="w-full pl-10 pr-12 py-3.5 rounded-xl text-white placeholder-gray-600
                               outline-none transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      fontSize: '16px',
                    }}
                    onFocus={(e) => { e.target.style.borderColor = 'rgba(212,165,116,0.35)'; }}
                    onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors"
                    style={{ color: '#555' }}
                    aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl
                           font-semibold text-white transition-all touch-manipulation mt-2"
                style={{
                  background: loading
                    ? 'rgba(212,165,116,0.12)'
                    : 'linear-gradient(135deg, #8B6914 0%, #D4A574 100%)',
                  border: '1px solid rgba(212,165,116,0.3)',
                  fontSize: '15px',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? (
                  <>
                    <div
                      className="w-4 h-4 border-2 rounded-full animate-spin"
                      style={{ borderColor: 'rgba(255,255,255,0.2)', borderTopColor: '#fff' }}
                    />
                    <span>{t('signingIn')}</span>
                  </>
                ) : (
                  <>
                    <LogIn size={18} />
                    <span>{t('signIn')}</span>
                  </>
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-xs mt-6" style={{ color: '#2a2420' }}>
            {t('copyright')} &copy; {new Date().getFullYear()}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
