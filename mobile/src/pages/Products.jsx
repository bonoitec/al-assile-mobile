import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, ShoppingCart, RefreshCw, Package, ScanBarcode, LogOut, ChevronRight } from 'lucide-react';
import { formatCurrency } from '../utils/currency.js';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.jsx';
import { useCart } from '../hooks/useCart.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import ProductCard from '../components/ProductCard.jsx';
import BarcodeScanner from '../components/BarcodeScanner.jsx';
import { t, getLanguage, setLanguage } from '../utils/i18n.js';

export default function Products() {
  const api = useApi();
  const { addItem, isInCart, getItemCount } = useCart();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'favorites'
  const [refreshing, setRefreshing] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanNotification, setScanNotification] = useState(null); // { type: 'success'|'error', message }
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [lang, setLang] = useState(getLanguage());
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [debtors, setDebtors] = useState([]);
  const userMenuRef = useRef(null);

  const fetchProducts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const data = await api.get('/api/products');
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || t('failedToLoadProducts'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, []);

  // Debt reminder — passive background fetch, fails silently so a network
  // blip never breaks the home page.
  useEffect(() => {
    api.get('/api/clients')
      .then(data => {
        const list = Array.isArray(data) ? data : (data?.data || []);
        setDebtors(list.filter(c => (c.balance || 0) < 0));
      })
      .catch(() => {});
  }, []);

  const filtered = products.filter(p => {
    if (filter === 'favorites' && !p.is_favorite) return false;
    if (!query) return true;
    return (p.name || '').toLowerCase().includes(query.toLowerCase());
  });

  const cartCount = getItemCount();

  const handleAddToCart = (product) => {
    addItem(product, 1);
  };

  const showScanFeedback = (type, message) => {
    setScanNotification({ type, message });
    setTimeout(() => setScanNotification(null), 3000);
  };

  // Close user menu on outside click
  useEffect(() => {
    if (!showUserMenu) return;
    const handler = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [showUserMenu]);

  const handleLogout = () => {
    setShowUserMenu(false);
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    logout();
    navigate('/login');
  };

  const handleBarcodeScan = useCallback(async (raw) => {
    // Normalize: trim whitespace + strip any CR/LF/TAB that some scanners append
    // as a terminator emulation. Without this, "1234567\r" !== "1234567".
    const barcode = String(raw || '').replace(/[\r\n\t]/g, '').trim();
    if (!barcode) return;

    // Try exact match against in-memory products first (fastest, offline-safe)
    let found = products.find(p => p.barcode === barcode);

    // Leading-zero normalization fallback: admin may have typed "12345" but
    // the scanner emits the EAN-13 padded "0000000012345" (or vice-versa).
    // Compare with leading zeros stripped from both sides.
    if (!found) {
      const scannedStripped = barcode.replace(/^0+/, '');
      if (scannedStripped) {
        found = products.find(p => {
          if (!p.barcode) return false;
          const storedStripped = String(p.barcode).replace(/^0+/, '');
          return storedStripped === scannedStripped;
        });
      }
    }

    // Server fallback: products added after this session loaded aren't in the
    // in-memory array yet. Ask the server directly before giving up.
    if (!found) {
      try {
        const remote = await api.get('/api/products/barcode/' + encodeURIComponent(barcode));
        if (remote && remote.data && remote.data.id) {
          found = remote.data;
        }
      } catch {
        // 404 = not found (expected); network errors silently fall through.
      }
    }

    if (!found) {
      showScanFeedback('error', `${t('noProductForBarcode')}: ${barcode}`);
      return;
    }

    // Out-of-stock guard: addItem would otherwise store a quantity-0 cart line
    // because Math.min(1, 0) = 0, leaving a ghost entry the cashier has to delete.
    if ((found.quantity ?? 0) <= 0) {
      showScanFeedback('error', `${found.name}: ${t('outOfStock')}`);
      return;
    }

    addItem(found, 1);
    showScanFeedback('success', `${t('added')}: ${found.name}`);
  }, [products, addItem, api]);

  return (
    <div className="h-full flex flex-col" style={{ background: '#080c14' }}>
      {/* Top bar */}
      <div
        className="flex-shrink-0 safe-top"
        style={{ background: 'rgba(8,12,20,0.97)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div className="flex items-center gap-3 px-4 pt-2 pb-3">
          <div className="flex-1">
            <h1 className="text-xl font-bold" style={{ color: '#D4A574' }}>{t('alAssile')}</h1>
            <p className="text-xs" style={{ color: '#3d5068' }}>
              {user?.username || t('salesperson')}
            </p>
          </div>

          {/* User avatar + dropdown */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(v => !v)}
              className="w-10 h-10 flex items-center justify-center rounded-full font-bold text-sm touch-manipulation"
              style={{
                background: showUserMenu ? 'rgba(212,165,116,0.2)' : 'rgba(212,165,116,0.1)',
                border: '1px solid rgba(212,165,116,0.25)',
                color: '#D4A574',
              }}
              aria-label={t('userMenuLabel')}
              aria-expanded={showUserMenu}
            >
              {(user?.username || 'U').slice(0, 1).toUpperCase()}
            </button>

            <AnimatePresence>
              {showUserMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-12 z-50 rounded-2xl overflow-hidden"
                  style={{
                    background: '#0d1120',
                    border: '1px solid rgba(255,255,255,0.1)',
                    minWidth: '180px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  }}
                >
                  <div
                    className="px-4 py-3"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    <p className="text-sm font-semibold text-white truncate">
                      {user?.username || t('defaultUserLabel')}
                    </p>
                    <p className="text-xs mt-0.5 truncate capitalize" style={{ color: '#4a5568' }}>
                      {user?.role || t('salesperson')}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const next = lang === 'en' ? 'ar' : 'en';
                      setLanguage(next);
                      setLang(next);
                      setShowUserMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold touch-manipulation"
                    style={{ color: '#D4A574', borderBottom: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    <span className="text-base">{lang === 'en' ? '🇩🇿' : '🇬🇧'}</span>
                    {lang === 'en' ? 'العربية' : 'English'}
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold touch-manipulation"
                    style={{ color: '#f87171' }}
                  >
                    <LogOut size={16} />
                    {t('logOut')}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            onClick={() => setShowScanner(true)}
            className="w-10 h-10 flex items-center justify-center rounded-full touch-manipulation"
            style={{ background: 'rgba(212,165,116,0.08)', border: '1px solid rgba(212,165,116,0.15)' }}
            aria-label={t('scanBarcodeLabel')}
          >
            <ScanBarcode size={19} style={{ color: '#D4A574' }} />
          </button>

          <button
            onClick={() => { setSearchOpen(v => !v); if (searchOpen) setQuery(''); }}
            className="w-10 h-10 flex items-center justify-center rounded-full touch-manipulation"
            style={{ background: searchOpen ? 'rgba(212,165,116,0.12)' : 'rgba(255,255,255,0.05)' }}
            aria-label={t('searchProductsLabel')}
          >
            {searchOpen ? (
              <X size={19} style={{ color: '#D4A574' }} />
            ) : (
              <Search size={19} style={{ color: '#9ca3af' }} />
            )}
          </button>

          <button
            onClick={() => fetchProducts(true)}
            disabled={refreshing}
            className="w-10 h-10 flex items-center justify-center rounded-full touch-manipulation"
            style={{ background: 'rgba(255,255,255,0.05)' }}
            aria-label={t('refreshProducts')}
          >
            <RefreshCw
              size={18}
              style={{ color: '#9ca3af' }}
              className={refreshing ? 'animate-spin' : ''}
            />
          </button>
        </div>

        {/* Debt reminder — two-tier card. Top line is the headline number
            (biggest debt), bottom row is the "N clients · total · review".
            RTL-safe: amounts stay LTR so digits read correctly in Arabic. */}
        {debtors.length > 0 && (() => {
          const isRTL = lang === 'ar';
          const totalOwed = debtors.reduce((sum, d) => sum + Math.max(0, -(d.balance || 0)), 0);
          // Sort by owed amount; biggest first is what the shopkeeper acts on
          const topDebtor = [...debtors].sort((a, b) => (a.balance || 0) - (b.balance || 0))[0];
          const topOwed = Math.max(0, -(topDebtor.balance || 0));
          return (
            <motion.button
              type="button"
              onClick={() => navigate('/clients')}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              dir={isRTL ? 'rtl' : 'ltr'}
              className="mx-4 mb-3 w-[calc(100%-2rem)] overflow-hidden rounded-2xl touch-manipulation text-left"
              style={{
                background: 'linear-gradient(135deg, rgba(245,158,11,0.14), rgba(239,68,68,0.10))',
                border: '1px solid rgba(245,158,11,0.3)',
              }}
            >
              {/* Headline: total amount owed, BIG */}
              <div className="flex items-center gap-3 px-4 pt-3 pb-2">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(245,158,11,0.2)' }}
                >
                  <span className="text-xl">💰</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#d97706' }}>
                    {t('debtsToCollect')}
                  </p>
                  <p className="text-xl font-bold" style={{ color: '#fbbf24' }} dir="ltr">
                    {formatCurrency(totalOwed)}
                  </p>
                </div>
                <ChevronRight
                  size={18}
                  style={{
                    color: '#fbbf24',
                    transform: isRTL ? 'scaleX(-1)' : 'none',
                  }}
                />
              </div>
              {/* Secondary: top debtor preview */}
              <div
                className="flex items-center gap-2 px-4 py-2 border-t"
                style={{ borderColor: 'rgba(245,158,11,0.15)', background: 'rgba(0,0,0,0.15)' }}
              >
                <span className="text-xs" style={{ color: '#a16207' }}>
                  {debtors.length === 1
                    ? `${t('clientOwesLabel')}:`
                    : `${t('biggestDebtor')}:`}
                </span>
                <span className="text-xs font-semibold truncate flex-1" style={{ color: '#fbbf24' }}>
                  {topDebtor.name}
                </span>
                <span className="text-xs font-bold" style={{ color: '#f87171' }} dir="ltr">
                  {formatCurrency(topOwed)}
                </span>
                {debtors.length > 1 && (
                  <span className="text-[10px]" style={{ color: '#a16207' }}>
                    +{debtors.length - 1}
                  </span>
                )}
              </div>
            </motion.button>
          );
        })()}

        {/* Search bar */}
        <AnimatePresence>
          {searchOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden px-4 pb-3"
            >
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: '#4a5568' }}
                />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={t('searchProducts')}
                  autoFocus
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-white placeholder-gray-600 outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    fontSize: '16px',
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Filter pills */}
        <div className="flex gap-2 px-4 pb-3">
          {['all', 'favorites'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-4 py-1.5 rounded-full text-xs font-semibold touch-manipulation transition-all"
              style={{
                background: filter === f ? 'rgba(212,165,116,0.15)' : 'rgba(255,255,255,0.04)',
                border: filter === f ? '1px solid rgba(212,165,116,0.3)' : '1px solid rgba(255,255,255,0.07)',
                color: filter === f ? '#D4A574' : '#4a5568',
              }}
            >
              {f === 'all' ? t('allProducts') : t('favorites')}
            </button>
          ))}
        </div>
      </div>

      {/* Scan notification banner */}
      <AnimatePresence>
        {scanNotification && (
          <motion.div
            role={scanNotification.type === 'error' ? 'alert' : 'status'}
            aria-live="polite"
            aria-atomic="true"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="flex-shrink-0 mx-4 mt-2 px-4 py-3 rounded-xl flex items-center gap-3"
            style={{
              background: scanNotification.type === 'success'
                ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
              border: scanNotification.type === 'success'
                ? '1px solid rgba(16,185,129,0.25)' : '1px solid rgba(239,68,68,0.25)',
            }}
          >
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{
                background: scanNotification.type === 'success' ? '#34d399' : '#f87171',
              }}
            />
            <p
              className="text-sm font-medium flex-1"
              style={{ color: scanNotification.type === 'success' ? '#34d399' : '#f87171' }}
            >
              {scanNotification.message}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto scroll-touch content-with-nav">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div
              className="w-10 h-10 border-2 rounded-full animate-spin"
              style={{ borderColor: 'rgba(212,165,116,0.15)', borderTopColor: '#D4A574' }}
            />
            <p className="text-sm" style={{ color: '#3d5068' }}>{t('loadingProducts')}</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 px-6 gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(239,68,68,0.1)' }}
            >
              <Package size={28} style={{ color: '#f87171' }} />
            </div>
            <p className="text-sm text-center" style={{ color: '#f87171' }}>{error}</p>
            <button
              onClick={() => fetchProducts()}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold touch-manipulation"
              style={{ background: 'rgba(212,165,116,0.1)', border: '1px solid rgba(212,165,116,0.2)', color: '#D4A574' }}
            >
              {t('tryAgain')}
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 px-6 gap-3">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(212,165,116,0.07)' }}
            >
              <Package size={28} style={{ color: '#D4A574', opacity: 0.5 }} />
            </div>
            <p className="text-base font-semibold text-white">{t('noProductsFound')}</p>
            <p className="text-sm text-center" style={{ color: '#3d5068' }}>
              {query ? `${t('noResultsFor')} "${query}"` : t('noProductsInCategory')}
            </p>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-2 gap-3">
            {filtered.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onAdd={handleAddToCart}
                isInCart={isInCart(product.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Barcode scanner */}
      <BarcodeScanner
        isOpen={showScanner}
        onScan={handleBarcodeScan}
        onClose={() => setShowScanner(false)}
      />

      {/* Logout confirm dialog */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 22 }}
              className="w-full max-w-xs rounded-2xl p-6"
              style={{ background: '#0d1120', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <h3 className="text-base font-bold text-white mb-2">{t('logOut')}?</h3>
              <p className="text-sm mb-6" style={{ color: '#6b7280' }}>
                {t('logOutConfirm')}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold touch-manipulation"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#9ca3af',
                  }}
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={confirmLogout}
                  className="flex-1 py-3 rounded-xl text-sm font-bold touch-manipulation"
                  style={{
                    background: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    color: '#f87171',
                  }}
                >
                  {t('logOut')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating cart button */}
      <AnimatePresence>
        {cartCount > 0 && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileTap={{ scale: 0.93 }}
            onClick={() => navigate('/cart')}
            className="fixed right-5 touch-manipulation"
            style={{
              bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))',
              zIndex: 40,
              background: 'linear-gradient(135deg, #8B6914 0%, #D4A574 100%)',
              border: '1px solid rgba(212,165,116,0.4)',
              borderRadius: '50%',
              width: '56px',
              height: '56px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(212,165,116,0.25)',
            }}
            aria-label={`View cart, ${cartCount} items`}
          >
            <ShoppingCart size={22} className="text-white" />
            <span
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center
                         justify-center text-[10px] font-bold text-white"
              style={{ background: '#ef4444' }}
            >
              {cartCount > 99 ? '99+' : cartCount}
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
