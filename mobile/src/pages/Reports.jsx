import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Printer, CheckCircle2, RefreshCw, AlertTriangle, Loader2, X } from 'lucide-react';
import { useApi } from '../hooks/useApi.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import { formatCurrency } from '../utils/currency.js';
import { t } from '../utils/i18n.js';

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
      alert(err.message || 'Failed to repair balance');
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
// Reports page
// ======================================================================
export default function Reports() {
  const api = useApi();
  const [tab, setTab] = useState('receivables');
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
    { id: 'receivables',  label: t('receivablesReport') },
    { id: 'allBalances',  label: t('allBalancesReport') },
    { id: 'audit',        label: t('balanceAudit') },
  ];

  return (
    <div className="h-full flex flex-col safe-top" style={{ background: '#080c14' }}>
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-4 pb-3">
        <h1 className="text-2xl font-bold text-white mb-4">{t('reports')}</h1>

        {/* Tab bar */}
        <div
          className="flex rounded-xl p-1"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all touch-manipulation"
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
        {loadingClients && tab !== 'audit' ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin" style={{ color: '#D4A574' }} />
          </div>
        ) : (
          <>
            {tab === 'receivables' && <ReceivablesTab clients={clients} />}
            {tab === 'allBalances' && <AllBalancesTab clients={clients} />}
            {tab === 'audit' && <AuditTab />}
          </>
        )}
      </div>
    </div>
  );
}
