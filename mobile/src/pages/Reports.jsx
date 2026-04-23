import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Printer, CheckCircle2, RefreshCw, AlertTriangle, Loader2, X,
  TrendingUp, Package, Truck, ShoppingCart, DollarSign, Receipt,
} from 'lucide-react';
import { useApi } from '../hooks/useApi.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import { formatCurrency } from '../utils/currency.js';
import { t } from '../utils/i18n.js';

// Small helper: YYYY-MM-DD in local time (not UTC). Used for date ranges.
function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function rangeFor(preset) {
  const today = new Date();
  const end = isoDate(today);
  if (preset === 'today') return { start: end, end };
  if (preset === 'week') {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - 6);
    return { start: isoDate(weekStart), end };
  }
  if (preset === 'month') {
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    return { start: isoDate(monthStart), end };
  }
  return { start: end, end };
}

// ======================================================================
// Print styles — hidden on screen, clean table layout on paper
// ======================================================================
const PRINT_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');

@page { margin: 1.5cm; }

@media print {
  body {
    font-family: 'Cairo', 'Arial', sans-serif !important;
    font-size: 11pt !important;
    background: white !important;
    color: black !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  body * { visibility: hidden; }
  #report-print-area, #report-print-area * { visibility: visible; }
  #report-print-area {
    position: fixed;
    inset: 0;
    background: white !important;
    color: black !important;
    padding: 0;
    font-family: 'Cairo', 'Arial', sans-serif;
    font-size: 11pt;
    direction: rtl;
  }
  #report-print-area * {
    background: white !important;
    color: black !important;
    border-color: #ccc !important;
    box-shadow: none !important;
  }
  .no-print { display: none !important; }
  .print-header {
    display: block !important;
    text-align: center;
    border-bottom: 2px solid #333;
    padding-bottom: 0.5rem;
    margin-bottom: 1rem;
  }
  .print-shop-name {
    font-size: 16pt;
    font-weight: bold;
    color: black !important;
  }
  .print-report-title {
    font-size: 13pt;
    font-weight: 600;
    color: black !important;
    margin-top: 0.2rem;
  }
  .print-date {
    font-size: 9pt;
    color: #555 !important;
    margin-top: 0.15rem;
  }
  table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
  th, td {
    border: 1px solid #999 !important;
    padding: 5px 8px;
    text-align: start;
    font-size: 11pt;
    background: white !important;
    color: black !important;
  }
  tr { page-break-inside: avoid; }
  th { background: #f0f0f0 !important; font-weight: bold; }
  .print-total { font-weight: bold; font-size: 12pt; margin-top: 0.75rem; color: black !important; }
  .print-title { font-size: 15pt; font-weight: bold; margin-bottom: 0.25rem; color: black !important; }
  .print-subtitle { font-size: 10pt; color: #555 !important; margin-bottom: 0.75rem; }
  .hidden { display: block !important; }
}
`;

// ======================================================================
// Helpers
// ======================================================================
function PrintButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="no-print flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold touch-manipulation"
      style={{
        background: 'rgba(212,165,116,0.12)',
        border: '1px solid rgba(212,165,116,0.25)',
        color: '#D4A574',
      }}
    >
      <Printer size={14} />
      {t('printReport')}
    </button>
  );
}

// ======================================================================
// Receivables tab — clients with balance < 0
// ======================================================================
function ReceivablesTab({ clients }) {
  const debtors = clients.filter(c => (c.balance || 0) < 0)
    .sort((a, b) => (a.balance || 0) - (b.balance || 0));
  const totalOwed = debtors.reduce((s, c) => s + Math.abs(c.balance || 0), 0);

  const handlePrint = () => window.print();

  return (
    <div>
      <style>{PRINT_STYLES}</style>
      <div id="report-print-area">
        <div className="no-print flex items-center justify-between mb-4">
          <div
            className="rounded-xl px-4 py-3"
            style={{
              background: 'rgba(239,68,68,0.07)',
              border: '1px solid rgba(239,68,68,0.15)',
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#f87171' }}>
              {t('totalOwed')}
            </p>
            <p className="text-xl font-bold mt-0.5" style={{ color: '#f87171' }}>
              {formatCurrency(totalOwed)}
            </p>
          </div>
          <PrintButton onClick={handlePrint} />
        </div>

        {/* Print header */}
        <div className="print-header" style={{ display: 'none' }}>
          <div className="print-shop-name">Al Assile</div>
          <div className="print-report-title">{t('receivablesReport')}</div>
          <div className="print-date">{new Date().toLocaleDateString()}</div>
        </div>
        <div className="hidden print-title" style={{ display: 'none' }}>{t('receivablesReport')}</div>
        <div className="hidden print-subtitle" style={{ display: 'none' }}>
          {t('totalOwed')}: {formatCurrency(totalOwed)}
        </div>

        {debtors.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle2 size={48} className="mx-auto mb-3" style={{ color: '#34d399' }} />
            <p style={{ color: '#34d399' }}>{t('noDebtors')}</p>
          </div>
        ) : (
          <>
            {/* Screen list */}
            <div className="no-print space-y-2">
              {debtors.map(c => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-3.5 rounded-xl"
                  style={{
                    background: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.12)',
                  }}
                >
                  <div>
                    <p className="text-sm font-semibold text-white">{c.name}</p>
                    {c.phone && (
                      <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{c.phone}</p>
                    )}
                  </div>
                  <p className="text-base font-bold" style={{ color: '#f87171' }}>
                    {formatCurrency(Math.abs(c.balance || 0))}
                  </p>
                </div>
              ))}
            </div>

            {/* Print table */}
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('clientName')}</th>
                  <th>{t('clientPhone')}</th>
                  <th>{t('totalOwed')}</th>
                </tr>
              </thead>
              <tbody>
                {debtors.map((c, i) => (
                  <tr key={c.id}>
                    <td>{i + 1}</td>
                    <td>{c.name}</td>
                    <td>{c.phone || '—'}</td>
                    <td>{formatCurrency(Math.abs(c.balance || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="print-total">{t('totalOwed')}: {formatCurrency(totalOwed)}</p>
          </>
        )}
      </div>
    </div>
  );
}

// ======================================================================
// All balances tab — clients with balance != 0, debtors first then credit
// ======================================================================
function AllBalancesTab({ clients }) {
  const withBalance = clients.filter(c => (c.balance || 0) !== 0);
  const debtors = withBalance.filter(c => (c.balance || 0) < 0)
    .sort((a, b) => (a.balance || 0) - (b.balance || 0));
  const creditors = withBalance.filter(c => (c.balance || 0) > 0)
    .sort((a, b) => (b.balance || 0) - (a.balance || 0));

  const totalOwed = debtors.reduce((s, c) => s + Math.abs(c.balance || 0), 0);
  const totalCredit = creditors.reduce((s, c) => s + (c.balance || 0), 0);

  const handlePrint = () => window.print();

  const renderRow = (c, isDebt) => (
    <div
      key={c.id}
      className="flex items-center justify-between p-3.5 rounded-xl"
      style={{
        background: isDebt ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.06)',
        border: isDebt ? '1px solid rgba(239,68,68,0.12)' : '1px solid rgba(16,185,129,0.12)',
      }}
    >
      <div>
        <p className="text-sm font-semibold text-white">{c.name}</p>
        {c.phone && (
          <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{c.phone}</p>
        )}
      </div>
      <p className="text-base font-bold" style={{ color: isDebt ? '#f87171' : '#34d399' }}>
        {isDebt ? '' : '+'}{formatCurrency(Math.abs(c.balance || 0))}
      </p>
    </div>
  );

  return (
    <div>
      <style>{PRINT_STYLES}</style>
      <div id="report-print-area">
        <div className="no-print flex items-center justify-between mb-4 gap-2">
          <div className="flex gap-2 flex-1">
            <div
              className="flex-1 rounded-xl px-3 py-2.5"
              style={{
                background: 'rgba(239,68,68,0.07)',
                border: '1px solid rgba(239,68,68,0.15)',
              }}
            >
              <p className="text-[10px] font-semibold uppercase" style={{ color: '#f87171' }}>{t('totalOwed')}</p>
              <p className="text-base font-bold" style={{ color: '#f87171' }}>{formatCurrency(totalOwed)}</p>
            </div>
            <div
              className="flex-1 rounded-xl px-3 py-2.5"
              style={{
                background: 'rgba(16,185,129,0.07)',
                border: '1px solid rgba(16,185,129,0.15)',
              }}
            >
              <p className="text-[10px] font-semibold uppercase" style={{ color: '#34d399' }}>{t('totalCredit')}</p>
              <p className="text-base font-bold" style={{ color: '#34d399' }}>{formatCurrency(totalCredit)}</p>
            </div>
          </div>
          <PrintButton onClick={handlePrint} />
        </div>

        {/* Print header */}
        <div className="print-header" style={{ display: 'none' }}>
          <div className="print-shop-name">Al Assile</div>
          <div className="print-report-title">{t('allBalancesReport')}</div>
          <div className="print-date">{new Date().toLocaleDateString()}</div>
        </div>
        <div className="hidden print-title" style={{ display: 'none' }}>{t('allBalancesReport')}</div>
        <div className="hidden print-subtitle" style={{ display: 'none' }}>
          {t('totalOwed')}: {formatCurrency(totalOwed)} | {t('totalCredit')}: {formatCurrency(totalCredit)}
        </div>

        {withBalance.length === 0 ? (
          <div className="text-center py-12">
            <p style={{ color: '#6b7280' }}>{t('noBalances')}</p>
          </div>
        ) : (
          <>
            {/* Screen */}
            <div className="no-print space-y-2">
              {debtors.length > 0 && (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#f87171' }}>
                    {t('owes')} ({debtors.length})
                  </p>
                  {debtors.map(c => renderRow(c, true))}
                </>
              )}
              {creditors.length > 0 && (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide mt-3 mb-1" style={{ color: '#34d399' }}>
                    {t('creditBalance')} ({creditors.length})
                  </p>
                  {creditors.map(c => renderRow(c, false))}
                </>
              )}
            </div>

            {/* Print table */}
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('clientName')}</th>
                  <th>{t('clientPhone')}</th>
                  <th>{t('balance')}</th>
                </tr>
              </thead>
              <tbody>
                {[...debtors, ...creditors].map((c, i) => (
                  <tr key={c.id}>
                    <td>{i + 1}</td>
                    <td>{c.name}</td>
                    <td>{c.phone || '—'}</td>
                    <td style={{ color: (c.balance || 0) < 0 ? '#c00' : '#060' }}>
                      {formatCurrency(c.balance || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="print-total">
              {t('totalOwed')}: {formatCurrency(totalOwed)} | {t('totalCredit')}: {formatCurrency(totalCredit)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ======================================================================
// Confirm-fix modal — shown before committing a balance repair
// ======================================================================
function ConfirmFixModal({ drift, onCancel, onConfirm, isFixing }) {
  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={isFixing ? undefined : onCancel} />
      <motion.div
        className="relative w-full max-w-sm mx-auto rounded-t-3xl flex flex-col overflow-hidden"
        style={{
          background: '#0d1120',
          border: '1px solid rgba(251,191,36,0.25)',
          paddingBottom: 'env(safe-area-inset-bottom, 12px)',
        }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
        </div>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 className="text-base font-bold text-white">{t('confirmFixBalance')}</h2>
          <button
            onClick={onCancel}
            disabled={isFixing}
            className="w-8 h-8 flex items-center justify-center rounded-full"
            style={{ background: 'rgba(255,255,255,0.06)', opacity: isFixing ? 0.4 : 1 }}
          >
            <X size={16} style={{ color: '#9ca3af' }} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm font-semibold text-white">{drift.name}</p>
          <div className="flex gap-3">
            <div
              className="flex-1 rounded-xl p-3 text-center"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#f87171' }}>
                {t('currentBalance')}
              </p>
              <p className="text-sm font-bold" style={{ color: '#f87171' }}>
                {formatCurrency(drift.stored_balance || 0)}
              </p>
            </div>
            <div
              className="flex-1 rounded-xl p-3 text-center"
              style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#34d399' }}>
                {t('willBecome')}
              </p>
              <p className="text-sm font-bold" style={{ color: '#34d399' }}>
                {formatCurrency(drift.expected_balance || 0)}
              </p>
            </div>
          </div>
        </div>
        <div className="px-5 pb-4 flex gap-2">
          <button
            onClick={onCancel}
            disabled={isFixing}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#9ca3af', opacity: isFixing ? 0.4 : 1 }}
          >
            {t('cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={isFixing}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold"
            style={{
              background: isFixing ? 'rgba(251,191,36,0.08)' : 'rgba(251,191,36,0.15)',
              border: '1px solid rgba(251,191,36,0.35)',
              color: '#fbbf24',
              opacity: isFixing ? 0.6 : 1,
            }}
          >
            {isFixing ? <Loader2 size={14} className="animate-spin" /> : null}
            {isFixing ? t('fixingBalance') : t('confirmFix')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ======================================================================
// Audit tab — calls GET /api/clients/audit, shows drifts + Fix buttons
// ======================================================================
function AuditTab() {
  const api = useApi();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fixingId, setFixingId] = useState(null);
  const [confirmDrift, setConfirmDrift] = useState(null); // drift object awaiting confirmation
  // Map of id → { old_balance, balance } for repaired items
  const [repairedMap, setRepairedMap] = useState({});
  const [error, setError] = useState('');

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/clients/audit');
      setData(res?.data || res);
    } catch (err) {
      setError(err.message || t('failedToLoadAudit'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAudit(); }, [fetchAudit]);

  const handleFix = async () => {
    if (!confirmDrift) return;
    const d = confirmDrift;
    setFixingId(d.id);
    try {
      const res = await api.post(`/api/clients/${d.id}/repair-balance`);
      const payload = res?.data || res;
      // New response shape: { id, old_balance, balance }
      const old_balance = payload?.old_balance ?? d.stored_balance ?? 0;
      const balance = payload?.balance ?? d.expected_balance ?? 0;
      setRepairedMap(prev => ({ ...prev, [d.id]: { old_balance, balance } }));
      setConfirmDrift(null);
      await fetchAudit();
    } catch (err) {
      setConfirmDrift(null);
      alert(err.message || t('failedToFixBalance'));
    } finally {
      setFixingId(null);
    }
  };

  const handlePrint = () => window.print();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={28} className="animate-spin" style={{ color: '#D4A574' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-xl p-4 flex items-start gap-3 mt-4"
        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}
      >
        <AlertTriangle size={18} style={{ color: '#f87171' }} className="flex-shrink-0 mt-0.5" />
        <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>
      </div>
    );
  }

  const drifts = Array.isArray(data?.drifts) ? data.drifts : [];

  return (
    <div>
      <style>{PRINT_STYLES}</style>
      <div id="report-print-area">
        <div className="no-print flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={fetchAudit}
              className="p-2.5 rounded-xl touch-manipulation"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <RefreshCw size={16} style={{ color: '#D4A574' }} />
            </button>
            {drifts.length > 0 && (
              <div
                className="rounded-xl px-4 py-2"
                style={{
                  background: 'rgba(251,191,36,0.08)',
                  border: '1px solid rgba(251,191,36,0.2)',
                }}
              >
                <p className="text-sm font-bold" style={{ color: '#fbbf24' }}>
                  {drifts.length} {t('driftsFound')}
                </p>
              </div>
            )}
          </div>
          <PrintButton onClick={handlePrint} />
        </div>

        {/* Print header */}
        <div className="print-header" style={{ display: 'none' }}>
          <div className="print-shop-name">Al Assile</div>
          <div className="print-report-title">{t('balanceAudit')}</div>
          <div className="print-date">{new Date().toLocaleDateString()}</div>
        </div>
        <div className="hidden print-title" style={{ display: 'none' }}>{t('balanceAudit')}</div>
        <div className="hidden print-subtitle" style={{ display: 'none' }}>
          {drifts.length} {t('driftsFound')}
        </div>

        {drifts.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle2 size={56} className="mx-auto mb-4" style={{ color: '#34d399' }} />
            <p className="text-base font-semibold" style={{ color: '#34d399' }}>
              {t('allBalancesMatch')}
            </p>
          </div>
        ) : (
          <>
            {/* Screen list */}
            <div className="no-print space-y-2">
              {drifts.map(d => {
                const repaired = repairedMap[d.id];
                const isFixed = !!repaired;
                const isFixing = fixingId === d.id;
                const driftAmt = (d.stored_balance || 0) - (d.expected_balance || 0);

                return (
                  <div
                    key={d.id}
                    className="rounded-xl p-3.5"
                    style={{
                      background: isFixed
                        ? 'rgba(16,185,129,0.07)'
                        : 'rgba(251,191,36,0.06)',
                      border: isFixed
                        ? '1px solid rgba(16,185,129,0.2)'
                        : '1px solid rgba(251,191,36,0.2)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{d.name}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
                          <span className="text-[11px]" style={{ color: '#9ca3af' }}>
                            {t('storedBalance')}: <span className="font-semibold text-white">{formatCurrency(d.stored_balance || 0)}</span>
                          </span>
                          <span className="text-[11px]" style={{ color: '#9ca3af' }}>
                            {t('expectedBalance')}: <span className="font-semibold text-white">{formatCurrency(d.expected_balance || 0)}</span>
                          </span>
                          <span className="text-[11px]" style={{ color: '#9ca3af' }}>
                            {t('drift')}: <span className="font-semibold" style={{ color: '#fbbf24' }}>{formatCurrency(driftAmt)}</span>
                          </span>
                        </div>
                        {/* Inline success toast after repair */}
                        {isFixed && (
                          <p className="text-[11px] mt-1.5 font-semibold" style={{ color: '#34d399' }}>
                            {t('repairedFromTo')}: {formatCurrency(repaired.old_balance)} → {formatCurrency(repaired.balance)}
                          </p>
                        )}
                      </div>
                      {isFixed ? (
                        <div className="flex items-center gap-1 text-xs font-semibold flex-shrink-0" style={{ color: '#34d399' }}>
                          <CheckCircle2 size={14} />
                          {t('balanceRepaired')}
                        </div>
                      ) : isAdmin ? (
                        <button
                          onClick={() => setConfirmDrift(d)}
                          disabled={isFixing}
                          className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold touch-manipulation"
                          style={{
                            background: 'rgba(251,191,36,0.15)',
                            border: '1px solid rgba(251,191,36,0.3)',
                            color: '#fbbf24',
                            opacity: isFixing ? 0.6 : 1,
                          }}
                        >
                          {isFixing ? t('fixingBalance') : t('fixBalance')}
                        </button>
                      ) : (
                        <button
                          disabled
                          className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold"
                          style={{
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            color: '#4a5568',
                            cursor: 'not-allowed',
                          }}
                          title={t('adminOnly')}
                        >
                          {t('adminOnlyShort')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Print table */}
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('clientName')}</th>
                  <th>{t('storedBalance')}</th>
                  <th>{t('expectedBalance')}</th>
                  <th>{t('drift')}</th>
                </tr>
              </thead>
              <tbody>
                {drifts.map((d, i) => (
                  <tr key={d.id}>
                    <td>{i + 1}</td>
                    <td>{d.name}</td>
                    <td>{formatCurrency(d.stored_balance || 0)}</td>
                    <td>{formatCurrency(d.expected_balance || 0)}</td>
                    <td>{formatCurrency((d.stored_balance || 0) - (d.expected_balance || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Confirmation modal */}
      <AnimatePresence>
        {confirmDrift && (
          <ConfirmFixModal
            drift={confirmDrift}
            onCancel={() => setConfirmDrift(null)}
            onConfirm={handleFix}
            isFixing={fixingId === confirmDrift?.id}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ======================================================================
// Dashboard tab — date range + sales/items/collected/outstanding + top products
// ======================================================================
function StatCard({ icon: Icon, label, value, tint }) {
  return (
    <div
      className="rounded-xl p-3.5"
      style={{
        background: `rgba(${tint},0.07)`,
        border: `1px solid rgba(${tint},0.18)`,
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={14} style={{ color: `rgb(${tint})` }} />
        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: `rgb(${tint})` }}>
          {label}
        </p>
      </div>
      <p className="text-lg font-bold text-white leading-tight">{value}</p>
    </div>
  );
}

function DashboardTab() {
  const api = useApi();
  const [preset, setPreset] = useState('today');
  const [range, setRange] = useState(() => rangeFor('today'));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    // useApi unwraps the { success, data } envelope — res is the summary object.
    api.get(`/api/reports/summary?start=${range.start}&end=${range.end}`)
      .then(res => setData(res))
      .catch(err => console.error('[reports] summary', err))
      .finally(() => setLoading(false));
  }, [range.start, range.end]);

  const setPresetRange = (p) => {
    setPreset(p);
    setRange(rangeFor(p));
  };

  const maxRevenue = useMemo(() => {
    const vals = (data?.daily || []).map(d => d.revenue || 0);
    return vals.length ? Math.max(...vals, 1) : 1;
  }, [data]);

  return (
    <div>
      {/* Range presets */}
      <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
        {[
          { id: 'today', label: t('rangeToday') },
          { id: 'week',  label: t('rangeWeek') },
          { id: 'month', label: t('rangeMonth') },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setPresetRange(id)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap touch-manipulation"
            style={{
              background: preset === id ? 'rgba(212,165,116,0.15)' : 'rgba(255,255,255,0.04)',
              border:     preset === id ? '1px solid rgba(212,165,116,0.35)' : '1px solid rgba(255,255,255,0.06)',
              color:      preset === id ? '#D4A574' : '#9ca3af',
            }}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex items-center px-2 text-[10px]" style={{ color: '#6b7280' }}>
          {range.start === range.end ? range.start : `${range.start} → ${range.end}`}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin" style={{ color: '#D4A574' }} />
        </div>
      ) : !data ? (
        <div className="text-center py-12">
          <p style={{ color: '#6b7280' }}>{t('noSalesInRange')}</p>
        </div>
      ) : (
        <>
          {/* Top-line cards */}
          <div className="grid grid-cols-2 gap-2.5 mb-4">
            <StatCard icon={TrendingUp} label={t('netSales')}    value={formatCurrency(data.net_sales)}    tint="52,211,153" />
            <StatCard icon={Receipt}    label={t('salesCount')}  value={data.sales_count}                  tint="212,165,116" />
            <StatCard icon={DollarSign} label={t('collected')}   value={formatCurrency(data.total_collected)} tint="96,165,250" />
            <StatCard icon={AlertTriangle} label={t('outstanding')} value={formatCurrency(data.outstanding)} tint="248,113,113" />
            <StatCard icon={Package}    label={t('unitsSold')}   value={data.items_sold}                   tint="244,114,182" />
            <StatCard icon={ShoppingCart} label={t('returnsTotal')} value={formatCurrency(data.returns_total)} tint="156,163,175" />
          </div>

          {/* Daily revenue bars */}
          {data.daily && data.daily.length > 1 && (
            <div
              className="rounded-xl p-3 mb-4"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#9ca3af' }}>
                {t('salesperDay')}
              </p>
              <div className="flex items-end gap-1 h-24">
                {data.daily.map((d) => (
                  <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${d.date}: ${formatCurrency(d.revenue)}`}>
                    <div
                      className="w-full rounded-t"
                      style={{
                        height: `${Math.max(3, (d.revenue / maxRevenue) * 100)}%`,
                        background: 'linear-gradient(to top, rgba(212,165,116,0.45), rgba(212,165,116,0.85))',
                      }}
                    />
                    <span className="text-[9px]" style={{ color: '#4a5568' }}>
                      {d.date.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top products */}
          {data.top_products && data.top_products.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#9ca3af' }}>
                {t('topProducts')}
              </p>
              <div className="space-y-1.5">
                {data.top_products.map((p, i) => (
                  <div
                    key={`${p.name}-${i}`}
                    className="flex items-center justify-between p-2.5 rounded-lg"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold w-5 text-center" style={{ color: '#D4A574' }}>{i + 1}</span>
                      <p className="text-sm text-white truncate">{p.name}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-[10px]" style={{ color: '#6b7280' }}>×{p.quantity}</span>
                      <span className="text-sm font-semibold" style={{ color: '#D4A574' }}>
                        {formatCurrency(p.revenue)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.sales_count === 0 && (
            <div className="text-center py-8">
              <p style={{ color: '#6b7280' }}>{t('noSalesInRange')}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ======================================================================
// Stock Alerts tab — products at or below minimum stock
// ======================================================================
function StockAlertsTab() {
  const api = useApi();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    // useApi unwraps the envelope — res is the array itself.
    api.get('/api/reports/stock-alerts')
      .then(res => setRows(Array.isArray(res) ? res : []))
      .catch(err => console.error('[reports] stock-alerts', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={28} className="animate-spin" style={{ color: '#D4A574' }} />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckCircle2 size={48} className="mx-auto mb-3" style={{ color: '#34d399' }} />
        <p style={{ color: '#34d399' }}>{t('noStockAlerts')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map(p => {
        const isOut = (p.quantity || 0) <= 0;
        const tint = isOut ? '239,68,68' : '251,146,60';
        return (
          <div
            key={p.id}
            className="flex items-center justify-between p-3.5 rounded-xl"
            style={{
              background: `rgba(${tint},0.06)`,
              border: `1px solid rgba(${tint},0.14)`,
            }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">{p.name}</p>
              <p className="text-[11px] mt-0.5" style={{ color: '#6b7280' }}>
                {t('minStockAlert')}: {p.min_stock_alert || 0} {p.unit || ''}
              </p>
            </div>
            <div className="text-right flex-shrink-0 ml-3">
              <p className="text-[10px] font-semibold uppercase" style={{ color: `rgb(${tint})` }}>
                {isOut ? t('outOfStock') : t('low')}
              </p>
              <p className="text-base font-bold" style={{ color: `rgb(${tint})` }}>
                {p.quantity || 0} {p.unit || ''}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ======================================================================
// Payables tab — suppliers the shop owes
// ======================================================================
function PayablesTab() {
  const api = useApi();
  const [data, setData] = useState({ suppliers: [], total_owed: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    // useApi unwraps the envelope — res is the { suppliers, total_owed } object.
    api.get('/api/reports/payables')
      .then(res => setData(res || { suppliers: [], total_owed: 0 }))
      .catch(err => console.error('[reports] payables', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={28} className="animate-spin" style={{ color: '#D4A574' }} />
      </div>
    );
  }

  const list = data.suppliers || [];

  return (
    <div>
      <div
        className="rounded-xl px-4 py-3 mb-4"
        style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)' }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#f87171' }}>
          {t('shopOwesSuppliers')}
        </p>
        <p className="text-xl font-bold mt-0.5" style={{ color: '#f87171' }}>
          {formatCurrency(data.total_owed || 0)}
        </p>
      </div>

      {list.length === 0 ? (
        <div className="text-center py-12">
          <CheckCircle2 size={48} className="mx-auto mb-3" style={{ color: '#34d399' }} />
          <p style={{ color: '#34d399' }}>{t('noPayables')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map(s => (
            <div
              key={s.id}
              className="flex items-center justify-between p-3.5 rounded-xl"
              style={{
                background: 'rgba(239,68,68,0.06)',
                border: '1px solid rgba(239,68,68,0.12)',
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{s.name}</p>
                {s.phone && (
                  <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{s.phone}</p>
                )}
              </div>
              <p className="text-base font-bold flex-shrink-0 ml-3" style={{ color: '#f87171' }}>
                {formatCurrency(Math.abs(s.balance || 0))}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ======================================================================
// Reports page
// ======================================================================
export default function Reports() {
  const api = useApi();
  const [tab, setTab] = useState('dashboard');
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);

  useEffect(() => {
    setLoadingClients(true);
    api.get('/api/clients')
      .then(res => setClients(Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : [])))
      .catch(err => console.error(err))
      .finally(() => setLoadingClients(false));
  }, []);

  const tabs = [
    { id: 'dashboard',    label: t('dashboard') },
    { id: 'stockAlerts',  label: t('stockAlerts') },
    { id: 'receivables',  label: t('receivablesReport') },
    { id: 'payables',     label: t('payablesReport') },
    { id: 'allBalances',  label: t('allBalancesReport') },
    { id: 'audit',        label: t('balanceAudit') },
  ];

  // Receivables/balances tabs depend on clients list — show a spinner only
  // when they're the active tab and clients haven't loaded yet.
  const needsClients = tab === 'receivables' || tab === 'allBalances';
  const showClientsSpinner = needsClients && loadingClients;

  return (
    <div className="h-full flex flex-col safe-top" style={{ background: '#080c14' }}>
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-4 pb-3">
        <h1 className="text-2xl font-bold text-white mb-4">{t('reports')}</h1>

        {/* Tab bar — scrollable since we have 6 tabs */}
        <div
          className="flex gap-1 rounded-xl p-1 overflow-x-auto no-scrollbar"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition-all touch-manipulation whitespace-nowrap"
              style={{
                background: tab === id ? 'rgba(212,165,116,0.15)' : 'transparent',
                color:      tab === id ? '#D4A574' : '#4a5568',
                border:     tab === id ? '1px solid rgba(212,165,116,0.25)' : '1px solid transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scroll-touch px-5 pb-6">
        {showClientsSpinner ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin" style={{ color: '#D4A574' }} />
          </div>
        ) : (
          <>
            {tab === 'dashboard'    && <DashboardTab />}
            {tab === 'stockAlerts'  && <StockAlertsTab />}
            {tab === 'receivables'  && <ReceivablesTab clients={clients} />}
            {tab === 'payables'     && <PayablesTab />}
            {tab === 'allBalances'  && <AllBalancesTab clients={clients} />}
            {tab === 'audit'        && <AuditTab />}
          </>
        )}
      </div>
    </div>
  );
}
