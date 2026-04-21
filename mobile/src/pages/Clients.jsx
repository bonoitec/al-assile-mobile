import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, Users, User, Phone, RefreshCw, ChevronRight,
  Wallet, History, Trash2, Edit2, AlertTriangle,
} from 'lucide-react';
import { useApi } from '../hooks/useApi.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import { formatCurrency } from '../utils/currency.js';
import { t } from '../utils/i18n.js';

/**
 * Plain-language balance label:
 *   balance < 0 → "Owes X DZD" (red)
 *   balance > 0 → "Has X DZD credit" (green)
 *   balance = 0 → "Clear" (muted)
 */
function BalanceBadge({ balance }) {
  const b = balance || 0;
  if (b < 0) {
    return (
      <span className="text-xs font-bold" style={{ color: '#f87171' }}>
        {t('owes')} {formatCurrency(Math.abs(b))}
      </span>
    );
  }
  if (b > 0) {
    return (
      <span className="text-xs font-bold" style={{ color: '#34d399' }}>
        +{formatCurrency(b)} {t('creditBalance')}
      </span>
    );
  }
  return (
    <span className="text-xs" style={{ color: '#6b7280' }}>
      {t('clear')}
    </span>
  );
}

export default function Clients() {
  const api = useApi();
  const { user } = useAuth();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'owes' | 'credit'
  const [selectedId, setSelectedId] = useState(null);

  const fetchClients = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.get('/api/clients');
      setClients(Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchClients(); }, []);

  const filtered = clients
    .filter(c => {
      if (filter === 'owes'   && !(c.balance < 0)) return false;
      if (filter === 'credit' && !(c.balance > 0)) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(query);
    })
    // Debt-first sort: clients who owe rise to the top (by size of debt),
    // then credit, then zero-balance. This makes the reminder flow land
    // the cashier on the most urgent row without any extra taps.
    .sort((a, b) => {
      const ba = a.balance || 0;
      const bb = b.balance || 0;
      const aOwes = ba < 0;
      const bOwes = bb < 0;
      if (aOwes && !bOwes) return -1;
      if (!aOwes && bOwes) return 1;
      if (aOwes && bOwes) return ba - bb; // more negative = owes more → higher
      return bb - ba;
    });

  const totalOwed = clients.reduce((s, c) => s + Math.max(0, -(c.balance || 0)), 0);
  const totalCredit = clients.reduce((s, c) => s + Math.max(0, c.balance || 0), 0);

  return (
    <div className="h-full flex flex-col safe-top" style={{ background: '#080c14' }}>
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold text-white">{t('clients')}</h1>
            <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
              {clients.length} {t('total')}
            </p>
          </div>
          <button
            onClick={() => fetchClients(true)}
            className="p-2.5 rounded-xl touch-manipulation"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <RefreshCw
              size={18}
              style={{ color: '#D4A574' }}
              className={refreshing ? 'animate-spin' : ''}
            />
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div
            className="rounded-xl p-3"
            style={{
              background: 'rgba(239,68,68,0.07)',
              border: '1px solid rgba(239,68,68,0.15)',
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#f87171' }}>
              {t('owes')}
            </p>
            <p className="text-base font-bold mt-0.5" style={{ color: '#f87171' }}>
              {formatCurrency(totalOwed)}
            </p>
          </div>
          <div
            className="rounded-xl p-3"
            style={{
              background: 'rgba(16,185,129,0.07)',
              border: '1px solid rgba(16,185,129,0.15)',
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#34d399' }}>
              {t('creditBalance')}
            </p>
            <p className="text-base font-bold mt-0.5" style={{ color: '#34d399' }}>
              {formatCurrency(totalCredit)}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2"
            style={{ color: '#4a5568' }}
          />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('searchClients')}
            className="w-full pl-10 pr-9 py-2.5 rounded-xl text-white placeholder-gray-600 outline-none"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              fontSize: '15px',
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter pills */}
        <div className="flex gap-2">
          {[
            { id: 'all',    label: t('all') },
            { id: 'owes',   label: t('owes') },
            { id: 'credit', label: t('creditBalance') },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className="px-4 py-1.5 rounded-full text-xs font-semibold touch-manipulation transition-all"
              style={{
                background: filter === id ? 'rgba(212,165,116,0.15)' : 'rgba(255,255,255,0.04)',
                border:     filter === id ? '1px solid rgba(212,165,116,0.3)' : '1px solid rgba(255,255,255,0.07)',
                color:      filter === id ? '#D4A574' : '#6b7280',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scroll-touch px-5 pb-4">
        {loading ? (
          <div className="text-center py-12" style={{ color: '#6b7280' }}>
            {t('loading')}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Users size={48} className="mx-auto mb-3" style={{ color: '#2a3a52' }} />
            <p style={{ color: '#6b7280' }}>
              {query ? t('noClientsMatch') : t('noClientsFound')}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(c => (
              <motion.button
                key={c.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedId(c.id)}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl text-left touch-manipulation"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
              >
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: 'rgba(212,165,116,0.12)',
                    border: '1px solid rgba(212,165,116,0.2)',
                  }}
                >
                  <User size={18} style={{ color: '#D4A574' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{c.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {c.phone && (
                      <span className="text-xs flex items-center gap-1" style={{ color: '#6b7280' }}>
                        <Phone size={11} />
                        {c.phone}
                      </span>
                    )}
                    <BalanceBadge balance={c.balance} />
                  </div>
                </div>
                <ChevronRight size={16} style={{ color: '#4a5568' }} />
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {/* Detail sheet */}
      <AnimatePresence>
        {selectedId !== null && (
          <ClientDetailSheet
            clientId={selectedId}
            onClose={() => setSelectedId(null)}
            onChanged={() => fetchClients(true)}
            // Server gates adjustment edit/delete to 'admin' only — match UI so
            // managers don't see buttons that would 403 when clicked.
            isAdmin={user?.role === 'admin'}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ======================================================================
// Client detail — balance, unpaid sales, versement button, history list
// ======================================================================
function ClientDetailSheet({ clientId, onClose, onChanged, isAdmin }) {
  const api = useApi();
  const [tab, setTab] = useState('overview'); // 'overview' | 'history'
  const [client, setClient] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showVersement, setShowVersement] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [clientRes, payRes] = await Promise.all([
        api.get(`/api/clients/${clientId}`),
        api.get(`/api/payments?client_id=${clientId}`),
      ]);
      setClient(clientRes?.data || clientRes);
      setPayments(Array.isArray(payRes?.data) ? payRes.data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { reload(); }, [reload]);

  const onDeletePayment = async (p) => {
    if (!window.confirm(t('confirmDeletePayment'))) return;
    try {
      await api.delete(`/api/payments/${p.id}`);
      await reload();
      onChanged();
    } catch (err) {
      alert(err.message || t('failedToDelete'));
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <motion.div
        className="absolute inset-x-0 bottom-0 rounded-t-3xl flex flex-col"
        style={{
          background: '#0d1120',
          border: '1px solid rgba(255,255,255,0.08)',
          maxHeight: '92vh',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(212,165,116,0.12)', border: '1px solid rgba(212,165,116,0.25)' }}
            >
              <User size={18} style={{ color: '#D4A574' }} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white truncate">{client?.name || '...'}</h2>
              {client?.phone && <p className="text-xs truncate" style={{ color: '#6b7280' }}>{client.phone}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          >
            <X size={18} style={{ color: '#9ca3af' }} />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 pb-3">
          <div
            className="flex rounded-xl p-1"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            {[
              { id: 'overview', label: t('overview') },
              { id: 'history',  label: t('paymentHistory') },
            ].map(({ id, label }) => (
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
        <div className="flex-1 overflow-y-auto scroll-touch px-5 pb-3">
          {loading ? (
            <div className="text-center py-8" style={{ color: '#6b7280' }}>{t('loading')}</div>
          ) : tab === 'overview' ? (
            <OverviewTab client={client} />
          ) : (
            <HistoryTab
              payments={payments}
              onDelete={onDeletePayment}
              onEdit={(p) => setEditingEntry(p)}
              isAdmin={isAdmin}
            />
          )}
        </div>

        {/* Action bar */}
        <div
          className="px-5 py-3"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.07)',
            background: 'rgba(13,17,32,0.96)',
          }}
        >
          <button
            onClick={() => setShowVersement(true)}
            disabled={!client}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-white text-base touch-manipulation"
            style={{
              background: 'linear-gradient(135deg, #065f46 0%, #10b981 100%)',
              border: '1px solid rgba(16,185,129,0.3)',
            }}
          >
            <Wallet size={18} />
            {t('recordPayment')}
          </button>
        </div>
      </motion.div>

      {/* Versement modal */}
      <AnimatePresence>
        {showVersement && client && (
          <VersementModal
            client={client}
            onClose={() => setShowVersement(false)}
            onDone={async () => {
              setShowVersement(false);
              await reload();
              onChanged();
            }}
          />
        )}
      </AnimatePresence>

      {/* Edit entry modal */}
      <AnimatePresence>
        {editingEntry && (
          <EditEntryModal
            entry={editingEntry}
            onClose={() => setEditingEntry(null)}
            onDone={async () => {
              setEditingEntry(null);
              await reload();
              onChanged();
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function OverviewTab({ client }) {
  if (!client) return null;
  const b = client.balance || 0;

  return (
    <div className="space-y-3 pt-1">
      {/* Balance card — plain language */}
      <div
        className="rounded-2xl p-4"
        style={{
          background: b < 0 ? 'rgba(239,68,68,0.08)' : b > 0 ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.04)',
          border:     b < 0 ? '1px solid rgba(239,68,68,0.18)' : b > 0 ? '1px solid rgba(16,185,129,0.18)' : '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-wide mb-1"
          style={{ color: b < 0 ? '#f87171' : b > 0 ? '#34d399' : '#6b7280' }}>
          {b < 0 ? t('owes') : b > 0 ? t('creditBalance') : t('balance')}
        </p>
        <p className="text-2xl font-bold"
          style={{ color: b < 0 ? '#f87171' : b > 0 ? '#34d399' : '#e5e7eb' }}>
          {formatCurrency(Math.abs(b))}
        </p>
      </div>

      {/* Unpaid sales */}
      {client.unpaid_sales && client.unpaid_sales.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#6b7280' }}>
            {t('unpaidSales')} ({client.unpaid_sales.length})
          </p>
          <div className="space-y-2">
            {client.unpaid_sales.map(s => (
              <div
                key={s.id}
                className="rounded-xl p-3 flex items-center justify-between"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
              >
                <div>
                  <p className="text-xs font-semibold text-white">#{s.id}</p>
                  <p className="text-[11px]" style={{ color: '#6b7280' }}>{new Date(s.date).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs" style={{ color: '#6b7280' }}>
                    {formatCurrency(s.paid_amount)} / {formatCurrency(s.total)}
                  </p>
                  <p className="text-sm font-bold" style={{ color: '#f59e0b' }}>
                    {formatCurrency(s.remaining)} {t('remaining')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-center py-4" style={{ color: '#6b7280' }}>
          {t('noUnpaidSales')}
        </p>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-[10px] uppercase tracking-wide" style={{ color: '#6b7280' }}>{t('totalSales')}</p>
          <p className="text-sm font-bold text-white mt-0.5">{client.sale_count || 0}</p>
        </div>
        <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-[10px] uppercase tracking-wide" style={{ color: '#6b7280' }}>{t('totalPurchases')}</p>
          <p className="text-sm font-bold text-white mt-0.5">{formatCurrency(client.total_purchases || 0)}</p>
        </div>
      </div>
    </div>
  );
}

function HistoryTab({ payments, onDelete, onEdit, isAdmin }) {
  if (payments.length === 0) {
    return (
      <div className="text-center py-8">
        <History size={40} className="mx-auto mb-3" style={{ color: '#2a3a52' }} />
        <p style={{ color: '#6b7280' }}>{t('noPaymentsYet')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-1">
      {payments.map(p => {
        const isAdjustment = p.method === 'adjustment';
        const isCredit     = p.method === 'credit_carry';
        const isReturn     = p.method === 'return';
        // Synthetic rows come from sales.paid_amount and can't be edited directly
        // (the shopkeeper should edit the sale itself to change the amount).
        const isReadOnly   = !!p.synthetic;
        const needsAdmin   = isAdjustment && !isAdmin;
        const label = isAdjustment
          ? (p.amount >= 0 ? t('creditAdjustment') : t('debitAdjustment'))
          : isCredit
            ? t('onAccountCredit')
            : isReturn
              ? t('returnCredit')
              : p.sale_id
                ? `${t('paymentForSale')} #${p.sale_id}`
                : t('clientPayment');

        return (
          <div
            key={p.id}
            className="rounded-xl p-3 flex items-center gap-3"
            style={{
              background: isAdjustment
                ? 'rgba(245,158,11,0.06)'
                : isCredit
                  ? 'rgba(59,130,246,0.06)'
                  : 'rgba(255,255,255,0.04)',
              border: isAdjustment
                ? '1px solid rgba(245,158,11,0.15)'
                : isCredit
                  ? '1px solid rgba(59,130,246,0.15)'
                  : '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{label}</p>
              <p className="text-[11px]" style={{ color: '#6b7280' }}>
                {new Date(p.date).toLocaleDateString()}
                {p.created_by_name && ` · ${p.created_by_name}`}
                <span className="ml-2 text-[10px] uppercase">{p.method}</span>
              </p>
              {p.notes && (
                <p className="text-[11px] italic mt-0.5 truncate" style={{ color: '#4a5568' }}>{p.notes}</p>
              )}
            </div>
            <div className="flex-shrink-0 text-right">
              <p
                className="text-base font-bold"
                style={{
                  color: p.amount < 0 ? '#f87171' : isCredit ? '#3b82f6' : '#34d399',
                }}
              >
                {p.amount >= 0 ? '+' : ''}{formatCurrency(p.amount)}
              </p>
            </div>
            {!isReadOnly && (
              <div className="flex flex-col gap-1 flex-shrink-0">
                <button
                  onClick={() => onEdit(p)}
                  disabled={needsAdmin}
                  className="p-1.5 rounded-lg touch-manipulation"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    color: needsAdmin ? '#2a3a52' : '#9ca3af',
                    opacity: needsAdmin ? 0.4 : 1,
                  }}
                  title={needsAdmin ? t('adminOnly') : t('edit')}
                >
                  <Edit2 size={13} />
                </button>
                <button
                  onClick={() => onDelete(p)}
                  disabled={needsAdmin}
                  className="p-1.5 rounded-lg touch-manipulation"
                  style={{
                    background: 'rgba(239,68,68,0.08)',
                    color: needsAdmin ? '#4a2a3a' : '#f87171',
                    opacity: needsAdmin ? 0.4 : 1,
                  }}
                  title={needsAdmin ? t('adminOnly') : t('delete')}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ======================================================================
// Versement modal — any amount, FIFO across unpaid sales
// ======================================================================
function VersementModal({ client, onClose, onDone }) {
  const api = useApi();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const numeric = parseFloat((amount || '').replace(',', '.')) || 0;
  const debt = Math.max(0, -(client.balance || 0));
  const projectedCredit = Math.max(0, numeric - debt);
  const appliedToDebt = Math.min(numeric, debt);

  const handleDigit = (d) => {
    setAmount(prev => {
      if (d === '.' && prev.includes('.')) return prev;
      if (d === '.' && !prev) return '0.';
      return prev + d;
    });
  };
  const handleBackspace = () => setAmount(prev => prev.slice(0, -1));

  const submit = async () => {
    if (numeric <= 0) return;
    setSubmitting(true);
    setError('');
    try {
      await api.post('/api/payments', {
        client_id: client.id,
        amount: numeric,
        method,
        notes: notes.trim() || null,
      });
      onDone();
    } catch (err) {
      setError(err.message || t('failedToRecordPayment'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[60]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={submitting ? undefined : onClose} />
      <motion.div
        className="absolute inset-x-0 bottom-0 rounded-t-3xl flex flex-col"
        style={{
          background: '#0d1120',
          border: '1px solid rgba(16,185,129,0.2)',
          maxHeight: '92vh',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28 }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
        </div>

        <div className="flex items-center justify-between px-5 py-3">
          <h2 className="text-lg font-bold text-white">{t('recordPayment')}</h2>
          <button
            onClick={onClose}
            disabled={submitting}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.06)', opacity: submitting ? 0.4 : 1 }}
          >
            <X size={18} style={{ color: '#9ca3af' }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scroll-touch px-5 pb-3 space-y-3">
          {/* Current debt */}
          <div
            className="rounded-xl p-3"
            style={{
              background: debt > 0 ? 'rgba(239,68,68,0.07)' : 'rgba(255,255,255,0.04)',
              border:     debt > 0 ? '1px solid rgba(239,68,68,0.15)' : '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <p className="text-xs" style={{ color: '#6b7280' }}>
              {client.name} {debt > 0 ? t('owes') : t('hasNoDebt')}
            </p>
            <p className="text-xl font-bold" style={{ color: debt > 0 ? '#f87171' : '#34d399' }}>
              {formatCurrency(debt)}
            </p>
          </div>

          {/* Amount */}
          <div
            className="rounded-xl px-4 py-3 text-right"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <p className="text-xs font-medium" style={{ color: '#4a5568' }}>
              {t('amountReceived')}
            </p>
            <p className="text-3xl font-bold text-white mt-1">
              {amount ? formatCurrency(numeric) : <span style={{ color: '#2a3a52' }}>0.00 DA</span>}
            </p>
          </div>

          {/* Percentage of debt shortcuts */}
          {debt > 0 && (
            <div className="flex gap-2">
              {[25, 50, 75, 100].map(pct => (
                <button
                  key={pct}
                  onClick={() => setAmount(String(Math.round(debt * pct / 100)))}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold touch-manipulation"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    color: '#D4A574',
                  }}
                >
                  {pct === 100 ? t('fullDebt') : `${pct}%`}
                </button>
              ))}
            </div>
          )}

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-2">
            {['1','2','3','4','5','6','7','8','9','.','0','⌫'].map(key => (
              <button
                key={key}
                onClick={() => key === '⌫' ? handleBackspace() : handleDigit(key)}
                className="py-3 rounded-xl text-base font-semibold touch-manipulation transition-all active:scale-95"
                style={{
                  background: key === '⌫' ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)',
                  border:     key === '⌫' ? '1px solid rgba(239,68,68,0.1)' : '1px solid rgba(255,255,255,0.06)',
                  color:      key === '⌫' ? '#f87171' : '#fff',
                }}
              >
                {key}
              </button>
            ))}
          </div>

          {/* Method */}
          <div
            className="flex rounded-xl p-1"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            {['cash', 'bank'].map(m => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all touch-manipulation"
                style={{
                  background: method === m ? 'rgba(212,165,116,0.15)' : 'transparent',
                  color:      method === m ? '#D4A574' : '#4a5568',
                  border:     method === m ? '1px solid rgba(212,165,116,0.25)' : '1px solid transparent',
                }}
              >
                {t(m)}
              </button>
            ))}
          </div>

          {/* Notes */}
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={t('notesOptional')}
            className="w-full px-4 py-2.5 rounded-xl text-white placeholder-gray-600 outline-none"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              fontSize: '15px',
            }}
          />

          {/* "What will happen" summary */}
          {numeric > 0 && (
            <div
              className="rounded-xl p-3 text-sm"
              style={{
                background: 'rgba(16,185,129,0.07)',
                border: '1px solid rgba(16,185,129,0.18)',
                color: '#34d399',
              }}
            >
              {appliedToDebt > 0 && (
                <p>
                  ✓ {formatCurrency(appliedToDebt)} {t('appliedToDebt')}
                </p>
              )}
              {projectedCredit > 0 && (
                <p>
                  ✓ {formatCurrency(projectedCredit)} {t('keptAsCredit')}
                </p>
              )}
            </div>
          )}

          {error && (
            <div
              className="rounded-xl p-3 flex items-start gap-2"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}
            >
              <AlertTriangle size={16} style={{ color: '#f87171' }} className="flex-shrink-0 mt-0.5" />
              <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>
            </div>
          )}
        </div>

        <div className="px-5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button
            onClick={submit}
            disabled={submitting || numeric <= 0}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-white text-base touch-manipulation"
            style={{
              background: numeric > 0 && !submitting
                ? 'linear-gradient(135deg, #065f46 0%, #10b981 100%)'
                : 'rgba(255,255,255,0.04)',
              border: numeric > 0 && !submitting ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(255,255,255,0.06)',
              opacity: numeric > 0 && !submitting ? 1 : 0.4,
            }}
          >
            <Wallet size={18} />
            {submitting ? t('processing') : t('recordPayment')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ======================================================================
// Edit entry modal — amount + notes
// ======================================================================
function EditEntryModal({ entry, onClose, onDone }) {
  const api = useApi();
  const [amount, setAmount] = useState(String(entry.amount));
  const [notes, setNotes] = useState(entry.notes || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const amt = parseFloat((amount || '').replace(',', '.'));
    if (!Number.isFinite(amt) || amt === 0) {
      setError(t('amountMustBeNonZero'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.patch(`/api/payments/${entry.id}`, {
        amount: amt,
        notes: notes.trim() || null,
      });
      onDone();
    } catch (err) {
      setError(err.message || t('failedToEdit'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={submitting ? undefined : onClose} />
      <motion.div
        className="relative w-full max-w-sm rounded-2xl flex flex-col overflow-hidden"
        style={{
          background: '#0d1120',
          border: '1px solid rgba(59,130,246,0.25)',
        }}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
      >
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 className="text-base font-bold text-white">{t('editPayment')}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full"
            style={{ background: 'rgba(255,255,255,0.06)' }}>
            <X size={16} style={{ color: '#9ca3af' }} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs font-semibold" style={{ color: '#6b7280' }}>
              {t('amount')} (DZD)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full mt-1 px-3 py-2.5 rounded-xl text-white text-right text-lg font-bold outline-none"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-semibold" style={{ color: '#6b7280' }}>
              {t('notes')}
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full mt-1 px-3 py-2.5 rounded-xl text-white outline-none"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                fontSize: '15px',
              }}
            />
          </div>

          {error && (
            <div className="rounded-xl p-2.5 text-xs" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
              {error}
            </div>
          )}
        </div>

        <div className="px-5 pb-4 flex gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#9ca3af' }}
          >
            {t('cancel')}
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{
              background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? '...' : t('save')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
