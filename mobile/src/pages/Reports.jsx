import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Printer, CheckCircle2, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';
import { useApi } from '../hooks/useApi.jsx';
import { formatCurrency } from '../utils/currency.js';
import { t } from '../utils/i18n.js';

// ======================================================================
// Print styles — hidden on screen, clean table layout on paper
// ======================================================================
const PRINT_STYLES = `
@media print {
  body * { visibility: hidden; }
  #report-print-area, #report-print-area * { visibility: visible; }
  #report-print-area {
    position: fixed;
    inset: 0;
    background: #fff;
    color: #000;
    padding: 2rem;
    font-family: Arial, sans-serif;
    font-size: 13px;
  }
  .no-print { display: none !important; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  th { background: #f3f3f3; font-weight: bold; }
  .print-total { font-weight: bold; font-size: 15px; margin-top: 0.75rem; }
  .print-title { font-size: 18px; font-weight: bold; margin-bottom: 0.25rem; }
  .print-subtitle { font-size: 12px; color: #555; margin-bottom: 1rem; }
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
        <div className="hidden print-title">{t('receivablesReport')}</div>
        <div className="hidden print-subtitle">
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
        <div className="hidden print-title">{t('allBalancesReport')}</div>
        <div className="hidden print-subtitle">
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
// Audit tab — calls GET /api/clients/audit, shows drifts + Fix buttons
// ======================================================================
function AuditTab() {
  const api = useApi();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fixingId, setFixingId] = useState(null);
  const [repairedIds, setRepairedIds] = useState(new Set());
  const [error, setError] = useState('');

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/clients/audit');
      setData(res?.data || res);
    } catch (err) {
      setError(err.message || 'Failed to load audit');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAudit(); }, [fetchAudit]);

  const handleFix = async (clientId) => {
    setFixingId(clientId);
    try {
      await api.post(`/api/clients/${clientId}/repair-balance`);
      setRepairedIds(prev => new Set([...prev, clientId]));
      await fetchAudit();
    } catch (err) {
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
        <div className="hidden print-title">{t('balanceAudit')}</div>
        <div className="hidden print-subtitle">
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
                const isFixed = repairedIds.has(d.id);
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
                      </div>
                      {isFixed ? (
                        <div className="flex items-center gap-1 text-xs font-semibold flex-shrink-0" style={{ color: '#34d399' }}>
                          <CheckCircle2 size={14} />
                          {t('balanceRepaired')}
                        </div>
                      ) : (
                        <button
                          onClick={() => handleFix(d.id)}
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
