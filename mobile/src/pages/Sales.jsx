import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, Receipt, ChevronDown, ChevronUp,
  Package, TrendingUp, TrendingDown, ShoppingBag, RotateCcw, Calendar,
  Search, X,
} from 'lucide-react';
import { useApi } from '../hooks/useApi.jsx';
import { formatCurrency } from '../utils/currency.js';
import ReceiptPrinter from '../components/ReceiptPrinter.jsx';
import ReturnModal from '../components/ReturnModal.jsx';
import { t } from '../utils/i18n.js';

const STATUS_CONFIG = {
  paid:    { labelKey: 'paid',        bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)', color: '#34d399' },
  partial: { labelKey: 'remaining',   bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)', color: '#f59e0b' },
  pending: { labelKey: 'pending',     bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.22)',  color: '#f87171' },
  credit:  { labelKey: 'credit',      bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.22)',  color: '#f87171' },
  return:  { labelKey: 'returnItems', bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.25)', color: '#a78bfa' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.paid;
  return (
    <span
      className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}
    >
      {t(cfg.labelKey)}
    </span>
  );
}

function SaleRow({ sale, settings, onReturn }) {
  const [expanded, setExpanded] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returning, setReturning] = useState(false);

  const time = new Date(sale.created_at).toLocaleTimeString('fr-DZ', { hour: '2-digit', minute: '2-digit' });
  const items = sale.items || sale.sale_items || [];

  const handleReturn = async (returnData) => {
    setReturning(true);
    try {
      await onReturn(sale.id, returnData);
      setShowReturnModal(false);
    } finally {
      setReturning(false);
    }
  };

  return (
    <>
      <motion.div
        layout
        className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Main row */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center gap-3 p-4 text-left touch-manipulation"
          aria-expanded={expanded}
        >
          {/* Sale number */}
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(212,165,116,0.1)' }}
          >
            <Receipt size={18} style={{ color: '#D4A574' }} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-white">#{sale.id}</p>
              <StatusBadge status={sale.status} />
            </div>
            <p className="text-xs mt-0.5 truncate" style={{ color: '#4a5568' }}>
              {sale.client_name || t('walkin')} · {time}
            </p>
          </div>

          {/* Total + expand */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <p className="text-sm font-bold" style={{ color: '#D4A574' }}>
              {formatCurrency(sale.total || 0)}
            </p>
            {expanded ? (
              <ChevronUp size={16} style={{ color: '#4a5568' }} />
            ) : (
              <ChevronDown size={16} style={{ color: '#4a5568' }} />
            )}
          </div>
        </button>

        {/* Expanded items */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div
                className="px-4 pb-4 pt-1 space-y-2"
                style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
              >
                {/* Payment details */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: '#4a5568' }}>{t('paid')}</p>
                    <p className="text-sm font-bold" style={{ color: '#34d399' }}>
                      {formatCurrency(sale.paid_amount || 0)}
                    </p>
                  </div>
                  {(sale.paid_amount || 0) < (sale.total || 0) && (
                    <div className="px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: '#4a5568' }}>{t('due')}</p>
                      <p className="text-sm font-bold" style={{ color: '#f59e0b' }}>
                        {formatCurrency((sale.total || 0) - (sale.paid_amount || 0))}
                      </p>
                    </div>
                  )}
                </div>

                {/* Items list */}
                <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: '#4a5568' }}>{t('items')}</p>
                {items.length === 0 ? (
                  <p className="text-xs" style={{ color: '#3d5068' }}>{t('noItemDetails')}</p>
                ) : (
                  items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-5 h-5 rounded-md flex items-center justify-center"
                          style={{ background: 'rgba(212,165,116,0.1)' }}
                        >
                          <Package size={11} style={{ color: '#D4A574' }} />
                        </div>
                        <span className="text-sm text-white">
                          {item.product_name || item.name || t('products')} × {item.quantity}
                        </span>
                      </div>
                      <span className="text-sm font-semibold" style={{ color: '#D4A574' }}>
                        {formatCurrency((item.unit_price || 0) * (item.quantity || 1))}
                      </span>
                    </div>
                  ))
                )}

                {/* Action buttons */}
                <div className="pt-2 flex gap-2">
                  <div className="flex-1">
                    <ReceiptPrinter sale={sale} settings={settings} />
                  </div>
                  {items.length > 0 && (
                    <button
                      onClick={() => setShowReturnModal(true)}
                      disabled={returning}
                      className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold touch-manipulation"
                      style={{
                        background: 'rgba(239,68,68,0.1)',
                        border: '1px solid rgba(239,68,68,0.2)',
                        color: '#f87171',
                        opacity: returning ? 0.5 : 1,
                      }}
                      aria-label="Return items from this sale"
                    >
                      <RotateCcw size={14} />
                      {t('returnItems')}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Return modal */}
      {showReturnModal && (
        <ReturnModal
          sale={sale}
          onConfirm={handleReturn}
          onClose={() => setShowReturnModal(false)}
        />
      )}
    </>
  );
}

function DailyStats({ date }) {
  const api = useApi();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!date) return;
    setLoading(true);
    api.get(`/api/reports/daily?date=${date}`)
      .then(data => setReport(data))
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [date]);

  if (loading) {
    return (
      <div className="px-4 pb-4">
        <div
          className="rounded-xl p-3 flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div className="w-4 h-4 border-2 rounded-full animate-spin mr-2"
            style={{ borderColor: 'rgba(212,165,116,0.15)', borderTopColor: '#D4A574' }} />
          <p className="text-xs" style={{ color: '#3d5068' }}>{t('loadingSales')}</p>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const stats = [
    {
      label: t('netSales'),
      value: formatCurrency(report.net_sales || report.total_revenue || 0),
      icon: TrendingUp,
      color: '#D4A574',
    },
    {
      label: t('collected'),
      value: formatCurrency(report.collected || report.total_paid || 0),
      icon: ShoppingBag,
      color: '#34d399',
    },
    {
      label: t('outstanding'),
      value: formatCurrency(report.outstanding || report.total_due || 0),
      icon: TrendingDown,
      color: '#f59e0b',
    },
    {
      label: t('itemsSold'),
      value: report.items_sold ?? report.total_items ?? '—',
      icon: Package,
      color: '#60a5fa',
    },
  ];

  return (
    <div className="px-4 pb-4">
      <div className="grid grid-cols-2 gap-2">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="rounded-xl p-3"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Icon size={12} style={{ color }} />
              <p className="text-[10px] uppercase tracking-wide font-medium" style={{ color: '#4a5568' }}>{label}</p>
            </div>
            <p className="text-sm font-bold truncate" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Sales() {
  const api = useApi();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState({});
  const [selectedDate, setSelectedDate] = useState(
    () => new Date().toISOString().split('T')[0]
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    api.get('/api/settings').then(setSettings).catch(() => {});
  }, []);

  const fetchSales = useCallback(async (silent = false, date = null) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');

    const dateStr = date || selectedDate;

    try {
      const data = await api.get(`/api/sales?date=${dateStr}`);
      const list = Array.isArray(data) ? data : [];
      list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setSales(list);
    } catch (err) {
      setError(err.message || 'Failed to load sales');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchSales(false, selectedDate);
  }, [selectedDate]);

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
  };

  const handleReturn = async (saleId, returnData) => {
    await api.post(`/api/sales/${saleId}/return`, returnData);
    fetchSales(true);
  };

  const filteredSales = searchQuery.trim()
    ? sales.filter(s => {
        const q = searchQuery.trim().toLowerCase();
        const idMatch = String(s.id).includes(q);
        const clientMatch = (s.client_name || '').toLowerCase().includes(q);
        return idMatch || clientMatch;
      })
    : sales;

  const displayDate = new Date(selectedDate + 'T00:00:00').toLocaleDateString('fr-DZ', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  return (
    <div className="h-full flex flex-col" style={{ background: '#080c14' }}>
      {/* Header */}
      <div
        className="flex-shrink-0 safe-top"
        style={{ background: 'rgba(8,12,20,0.97)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div className="flex items-center gap-3 px-4 pt-2 pb-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-white">
              {isToday ? t('todaysSales') : t('sales')}
            </h1>
            <p className="text-xs mt-0.5 capitalize truncate" style={{ color: '#3d5068' }}>
              {displayDate}
            </p>
          </div>

          {/* Search toggle */}
          <button
            onClick={() => { setSearchOpen(v => !v); if (searchOpen) setSearchQuery(''); }}
            className="w-10 h-10 flex items-center justify-center rounded-full touch-manipulation"
            style={{
              background: searchOpen ? 'rgba(212,165,116,0.12)' : 'rgba(255,255,255,0.05)',
            }}
            aria-label="Search sales"
          >
            {searchOpen ? (
              <X size={19} style={{ color: '#D4A574' }} />
            ) : (
              <Search size={19} style={{ color: '#9ca3af' }} />
            )}
          </button>

          <button
            onClick={() => fetchSales(true)}
            disabled={refreshing}
            className="w-10 h-10 flex items-center justify-center rounded-full touch-manipulation"
            style={{ background: 'rgba(255,255,255,0.05)' }}
            aria-label="Refresh sales"
          >
            <RefreshCw
              size={18}
              style={{ color: '#9ca3af' }}
              className={refreshing ? 'animate-spin' : ''}
            />
          </button>
        </div>

        {/* Collapsible search bar */}
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
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={t('searchSales')}
                  autoFocus
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-white placeholder-gray-600 outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    fontSize: '16px',
                  }}
                />
              </div>
              {searchQuery && (
                <p className="text-xs mt-2 px-1" style={{ color: '#4a5568' }}>
                  {filteredSales.length} {t('resultsFor')} "{searchQuery}"
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Date picker */}
        <div className="px-4 pb-3">
          <div
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <Calendar size={15} style={{ color: '#D4A574', flexShrink: 0 }} />
            <input
              type="date"
              value={selectedDate}
              onChange={handleDateChange}
              max={new Date().toISOString().split('T')[0]}
              className="flex-1 bg-transparent text-sm font-medium outline-none touch-manipulation"
              style={{
                color: '#fff',
                colorScheme: 'dark',
                fontSize: '14px',
              }}
              aria-label="Select date to view sales"
            />
            {!isToday && (
              <button
                onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                className="text-[10px] font-semibold px-2 py-1 rounded-lg touch-manipulation"
                style={{
                  background: 'rgba(212,165,116,0.1)',
                  border: '1px solid rgba(212,165,116,0.2)',
                  color: '#D4A574',
                }}
              >
                {t('today')}
              </button>
            )}
          </div>
        </div>

        {/* Daily stats */}
        {!loading && <DailyStats date={selectedDate} />}
      </div>

      {/* Sales list */}
      <div className="flex-1 overflow-y-auto scroll-touch content-with-nav px-4 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div
              className="w-10 h-10 border-2 rounded-full animate-spin"
              style={{ borderColor: 'rgba(212,165,116,0.15)', borderTopColor: '#D4A574' }}
            />
            <p className="text-sm" style={{ color: '#3d5068' }}>{t('loadingSales')}</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>
            <button
              onClick={() => fetchSales()}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold touch-manipulation"
              style={{ background: 'rgba(212,165,116,0.1)', border: '1px solid rgba(212,165,116,0.2)', color: '#D4A574' }}
            >
              Try Again
            </button>
          </div>
        ) : sales.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(212,165,116,0.07)', border: '1px solid rgba(212,165,116,0.1)' }}
            >
              <Receipt size={28} style={{ color: '#D4A574', opacity: 0.5 }} />
            </div>
            <div>
              <p className="text-lg font-bold text-white mb-1">
                {isToday ? t('noSalesToday') : t('noSalesOnDate')}
              </p>
              <p className="text-sm" style={{ color: '#3d5068' }}>
                {isToday ? t('salesAppearHere') : t('tryDifferentDate')}
              </p>
            </div>
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <Search size={28} style={{ color: '#4a5568', opacity: 0.6 }} />
            </div>
            <div>
              <p className="text-base font-bold text-white mb-1">{t('noResults')}</p>
              <p className="text-sm" style={{ color: '#3d5068' }}>
                No sales match "{searchQuery}"
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSales.map(sale => (
              <SaleRow
                key={sale.id}
                sale={sale}
                settings={settings}
                onReturn={handleReturn}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
