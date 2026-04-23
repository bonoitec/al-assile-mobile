import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, Truck, Phone, RefreshCw, ChevronRight,
  Wallet, History, Trash2, AlertTriangle, Loader2, PlusCircle,
} from 'lucide-react';
import { useApi } from '../hooks/useApi.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import { formatCurrency } from '../utils/currency.js';
import { t } from '../utils/i18n.js';

/**
 * Supplier balance semantics (inverse plain-language of clients):
 *   balance < 0 → shop owes supplier X
 *   balance > 0 → shop has prepayment credit sitting with them
 *   balance = 0 → clear
 */
function BalanceBadge({ balance }) {
  const b = balance || 0;
  if (b < 0) {
    return (
      <span className="text-xs font-bold" style={{ color: '#f87171' }}>
        {t('shopOwes')} {formatCurrency(Math.abs(b))}
      </span>
    );
  }
  if (b > 0) {
    return (
      <span className="text-xs font-bold" style={{ color: '#34d399' }}>
        +{formatCurrency(b)} {t('supplierHasCredit')}
      </span>
    );
  }
  return (
    <span className="text-xs" style={{ color: '#6b7280' }}>
      {t('clear')}
    </span>
  );
}

export default function Suppliers() {
  const api = useApi();
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'owes' | 'credit'
  const [selectedId, setSelectedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const fetchSuppliers = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.get('/api/suppliers');
      setSuppliers(Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchSuppliers(); }, []);

  const filtered = suppliers
    .filter(s => {
      if (filter === 'owes'   && !(s.balance < 0)) return false;
      if (filter === 'credit' && !(s.balance > 0)) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return (s.name || '').toLowerCase().includes(q) || (s.phone || '').includes(query);
    })
    // Debt-first sort: suppliers we owe rise to the top.
    .sort((a, b) => {
      const ba = a.balance || 0;
      const bb = b.balance || 0;
      const aOwes = ba < 0;
      const bOwes = bb < 0;
      if (aOwes && !bOwes) return -1;
      if (!aOwes && bOwes) return 1;
      if (aOwes && bOwes) return ba - bb;
      return bb - ba;
    });

  const totalOwed = suppliers.reduce((s, c) => s + Math.max(0, -(c.balance || 0)), 0);
  const totalCredit = suppliers.reduce((s, c) => s + Math.max(0, c.balance || 0), 0);

  return (
    <div className="h-full flex flex-col safe-top" style={{ background: '#080c14' }}>
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold text-white">{t('suppliers')}</h1>
            <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
              {suppliers.length} {t('total')}
            </p>
          </div>
          <button
            onClick={() => fetchSuppliers(true)}
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
          <button
            onClick={() => setShowAdd(true)}
            className="w-10 h-10 flex items-center justify-center rounded-full touch-manipulation ml-1"
            style={{
              background: 'rgba(16,185,129,0.12)',
              border: '1px solid rgba(16,185,129,0.3)',
            }}
            aria-label={t('addNewSupplier')}
          >
            <Truck size={18} style={{ color: '#34d399' }} />
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
              {t('shopOwes')}
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
              {t('supplierHasCredit')}
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
            placeholder={t('searchSuppliers')}
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
            { id: 'owes',   label: t('shopOwes') },
            { id: 'credit', label: t('supplierHasCredit') },
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
            <Truck size={48} className="mx-auto mb-3" style={{ color: '#2a3a52' }} />
            <p style={{ color: '#6b7280' }}>
              {query ? t('noSuppliersMatch') : t('noSuppliers')}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(s => (
              <motion.button
                key={s.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedId(s.id)}
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
                  <Truck size={18} style={{ color: '#D4A574' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{s.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {s.phone && (
                      <span className="text-xs flex items-center gap-1" style={{ color: '#6b7280' }}>
                        <Phone size={11} />
                        {s.phone}
                      </span>
                    )}
                    <BalanceBadge balance={s.balance} />
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
          <SupplierDetailSheet
            supplierId={selectedId}
            onClose={() => setSelectedId(null)}
            onChanged={() => fetchSuppliers(true)}
            isAdmin={user?.role === 'admin'}
          />
        )}
      </AnimatePresence>

      {/* Add supplier sheet */}
      <AnimatePresence>
        {showAdd && (
          <AddSupplierSheet
            onClose={() => setShowAdd(false)}
            onCreated={(newSupplier) => {
              setShowAdd(false);
              fetchSuppliers(true);
              if (newSupplier?.id) setSelectedId(newSupplier.id);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ======================================================================
// Supplier detail — balance, record payment, payment history
// ======================================================================
function SupplierDetailSheet({ supplierId, onClose, onChanged, isAdmin }) {
  const api = useApi();
  const [tab, setTab] = useState('overview'); // 'overview' | 'history'
  const [supplier, setSupplier] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [supRes, payRes] = await Promise.all([
        api.get(`/api/suppliers/${supplierId}`),
        api.get(`/api/suppliers/${supplierId}/payments`),
      ]);
      setSupplier(supRes?.data || supRes);
      setPayments(Array.isArray(payRes?.data) ? payRes.data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => { reload(); }, [reload]);

  const onDeletePayment = async (p) => {
    if (!window.confirm(t('confirmDeletePayment'))) return;
    try {
      await api.delete(`/api/suppliers/payments/${p.id}`);
      await reload();
      onChanged();
    } catch (err) {
      alert(err.message || t('failedToDelete'));
    }
  };

  const onDeleteSupplier = async () => {
    if (!window.confirm(t('confirmDeleteSupplier'))) return;
    try {
      await api.delete(`/api/suppliers/${supplierId}`);
      onClose();
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
              <Truck size={18} style={{ color: '#D4A574' }} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white truncate">{supplier?.name || '...'}</h2>
              {supplier?.phone && <p className="text-xs truncate" style={{ color: '#6b7280' }}>{supplier.phone}</p>}
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
              { id: 'history',  label: t('supplierPayments') },
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
            <OverviewTab supplier={supplier} isAdmin={isAdmin} onDelete={onDeleteSupplier} />
          ) : (
            <HistoryTab
              payments={payments}
              onDelete={onDeletePayment}
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
            onClick={() => setShowPayment(true)}
            disabled={!supplier}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-white text-base touch-manipulation"
            style={{
              background: 'linear-gradient(135deg, #065f46 0%, #10b981 100%)',
              border: '1px solid rgba(16,185,129,0.3)',
            }}
          >
            <Wallet size={18} />
            {t('recordSupplierPayment')}
          </button>
        </div>
      </motion.div>

      {/* Payment modal */}
      <AnimatePresence>
        {showPayment && supplier && (
          <SupplierPaymentModal
            supplier={supplier}
            onClose={() => setShowPayment(false)}
            onDone={async () => {
              setShowPayment(false);
              await reload();
              onChanged();
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function OverviewTab({ supplier, isAdmin, onDelete }) {
  if (!supplier) return null;
  const b = supplier.balance || 0;

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
          {b < 0 ? t('shopOwes') : b > 0 ? t('supplierHasCredit') : t('supplierBalance')}
        </p>
        <p className="text-2xl font-bold"
          style={{ color: b < 0 ? '#f87171' : b > 0 ? '#34d399' : '#e5e7eb' }}>
          {formatCurrency(Math.abs(b))}
        </p>
      </div>

      {/* Contact info */}
      {(supplier.address || supplier.email || supplier.notes) && (
        <div
          className="rounded-xl p-3 space-y-1.5"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          {supplier.address && (
            <div>
              <p className="text-[10px] uppercase tracking-wide" style={{ color: '#6b7280' }}>{t('clientAddress')}</p>
              <p className="text-sm text-white">{supplier.address}</p>
            </div>
          )}
          {supplier.email && (
            <div>
              <p className="text-[10px] uppercase tracking-wide" style={{ color: '#6b7280' }}>{t('email')}</p>
              <p className="text-sm text-white">{supplier.email}</p>
            </div>
          )}
          {supplier.notes && (
            <div>
              <p className="text-[10px] uppercase tracking-wide" style={{ color: '#6b7280' }}>{t('clientNotes')}</p>
              <p className="text-sm" style={{ color: '#9ca3af' }}>{supplier.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Admin-only delete */}
      {isAdmin && (
        <button
          onClick={onDelete}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold touch-manipulation"
          style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            color: '#f87171',
          }}
        >
          <Trash2 size={14} />
          {t('deleteSupplier')}
        </button>
      )}
    </div>
  );
}

function HistoryTab({ payments, onDelete, isAdmin }) {
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
        const isOpening = p.method === 'opening_balance';
        const label = isOpening
          ? t('openingBalance')
          : p.purchase_id
            ? `${t('applyToPurchase')} #${p.purchase_id}`
            : t('generalPayment');

        return (
          <div
            key={p.id}
            className="rounded-xl p-3 flex items-center gap-3"
            style={{
              background: isOpening ? 'rgba(245,158,11,0.06)' : 'rgba(255,255,255,0.04)',
              border:     isOpening ? '1px solid rgba(245,158,11,0.15)' : '1px solid rgba(255,255,255,0.07)',
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
                style={{ color: p.amount < 0 ? '#f87171' : '#34d399' }}
              >
                {p.amount >= 0 ? '+' : ''}{formatCurrency(p.amount)}
              </p>
            </div>
            {isAdmin && (
              <div className="flex-shrink-0">
                <button
                  onClick={() => onDelete(p)}
                  className="p-1.5 rounded-lg touch-manipulation"
                  style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171' }}
                  title={t('delete')}
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
// Supplier payment modal — amount + optional purchase_id
// ======================================================================
function SupplierPaymentModal({ supplier, onClose, onDone }) {
  const api = useApi();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [purchaseId, setPurchaseId] = useState('');
  const [notes, setNotes] = useState('');
  const [applyMode, setApplyMode] = useState('general'); // 'general' | 'purchase'
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const numeric = parseFloat((amount || '').replace(',', '.')) || 0;
  const debt = Math.max(0, -(supplier.balance || 0));

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
    if (applyMode === 'purchase' && !purchaseId.trim()) {
      setError(t('purchaseIdOptional'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const body = {
        amount: numeric,
        method,
        notes: notes.trim() || null,
      };
      if (applyMode === 'purchase' && purchaseId.trim()) {
        body.purchase_id = parseInt(purchaseId.trim(), 10);
      }
      await api.post(`/api/suppliers/${supplier.id}/payments`, body);
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
          <h2 className="text-lg font-bold text-white">{t('recordSupplierPayment')}</h2>
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
              {supplier.name} — {debt > 0 ? t('shopOwes') : t('clear')}
            </p>
            <p className="text-xl font-bold" style={{ color: debt > 0 ? '#f87171' : '#34d399' }}>
              {formatCurrency(debt)}
            </p>
          </div>

          {/* Apply mode toggle */}
          <div
            className="flex rounded-xl p-1"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            {[
              { id: 'general',  label: t('generalPayment') },
              { id: 'purchase', label: t('applyToPurchase') },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setApplyMode(id)}
                className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all touch-manipulation"
                style={{
                  background: applyMode === id ? 'rgba(212,165,116,0.15)' : 'transparent',
                  color:      applyMode === id ? '#D4A574' : '#4a5568',
                  border:     applyMode === id ? '1px solid rgba(212,165,116,0.25)' : '1px solid transparent',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Purchase ID field — only when apply mode is 'purchase' */}
          {applyMode === 'purchase' && (
            <input
              type="number"
              inputMode="numeric"
              value={purchaseId}
              onChange={e => setPurchaseId(e.target.value)}
              placeholder={t('purchaseIdOptional')}
              className="w-full px-4 py-2.5 rounded-xl text-white placeholder-gray-600 outline-none"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(212,165,116,0.25)',
                fontSize: '15px',
              }}
            />
          )}

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
            {submitting ? t('processing') : t('recordSupplierPayment')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ======================================================================
// Add supplier bottom sheet — name + contact + opening balance
// ======================================================================
function AddSupplierSheet({ onClose, onCreated }) {
  const api = useApi();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  // 'none' | 'credit' | 'owes' (shop has credit vs shop owes supplier)
  const [balanceSign, setBalanceSign] = useState('none');
  const [balanceAmount, setBalanceAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const parsedAmount = parseFloat(balanceAmount);
  const needsAmount = balanceSign !== 'none';
  const amountValid = !needsAmount || (Number.isFinite(parsedAmount) && parsedAmount > 0);
  const canSubmit = name.trim().length > 0 && !submitting && amountValid;

  const computeInitialBalance = () => {
    if (balanceSign === 'none') return 0;
    const amt = parseFloat(balanceAmount) || 0;
    if (balanceSign === 'credit') return amt;   // shop has prepaid credit → positive
    if (balanceSign === 'owes')   return -amt;  // shop already owes them → negative
    return 0;
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post('/api/suppliers', {
        name: name.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
        initial_balance: computeInitialBalance(),
      });
      const created = res?.data || res;
      onCreated(created);
    } catch (err) {
      setError(err?.message || t('failedToCreateSupplier'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget && !submitting) onClose(); }}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="absolute bottom-0 left-0 right-0 rounded-t-3xl flex flex-col"
        style={{
          background: '#0d1120',
          border: '1px solid rgba(255,255,255,0.08)',
          maxHeight: '85vh',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
        </div>
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(16,185,129,0.15)' }}
            >
              <Truck size={16} style={{ color: '#34d399' }} />
            </div>
            <h2 className="text-base font-bold text-white">{t('addNewSupplier')}</h2>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="w-8 h-8 flex items-center justify-center rounded-full"
            style={{ background: 'rgba(255,255,255,0.06)' }}
            aria-label={t('closeLabel')}
          >
            <X size={18} style={{ color: '#9ca3af' }} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scroll-touch px-5 pb-3 space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#9ca3af' }}>
              {t('supplierName')} <span style={{ color: '#f87171' }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              placeholder={t('supplierName')}
              className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-600 outline-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: '16px' }}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#9ca3af' }}>{t('clientPhone')}</label>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="0555 123 456"
              className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-600 outline-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: '16px' }}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#9ca3af' }}>{t('clientAddress')}</label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder={t('clientAddress')}
              className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-600 outline-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: '16px' }}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#9ca3af' }}>{t('clientNotes')}</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder={t('notesOptional')}
              className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-600 outline-none resize-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: '16px' }}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#9ca3af' }}>{t('openingBalance')}</label>
            <p className="text-[11px] mb-2" style={{ color: '#4a5568' }}>{t('openingBalanceSupplierHelp')}</p>
            <div
              className="flex rounded-xl p-1 mb-2"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {[
                { id: 'none',   label: t('supplierOpeningBalanceNone'),   activeColor: '#9ca3af',  activeBg: 'rgba(156,163,175,0.12)',  activeBorder: 'rgba(156,163,175,0.3)'  },
                { id: 'credit', label: t('supplierOpeningBalanceCredit'), activeColor: '#34d399',  activeBg: 'rgba(16,185,129,0.12)',   activeBorder: 'rgba(16,185,129,0.3)'   },
                { id: 'owes',   label: t('supplierOpeningBalanceOwes'),   activeColor: '#f87171',  activeBg: 'rgba(239,68,68,0.12)',    activeBorder: 'rgba(239,68,68,0.3)'    },
              ].map(({ id, label, activeColor, activeBg, activeBorder }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setBalanceSign(id)}
                  className="flex-1 py-2 px-1 rounded-lg text-[11px] font-semibold transition-all touch-manipulation leading-tight"
                  style={{
                    background:   balanceSign === id ? activeBg      : 'transparent',
                    color:        balanceSign === id ? activeColor    : '#4a5568',
                    border:       balanceSign === id ? `1px solid ${activeBorder}` : '1px solid transparent',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {balanceSign !== 'none' && (
              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={balanceAmount}
                onChange={e => setBalanceAmount(e.target.value)}
                placeholder="0"
                className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-600 outline-none"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${balanceSign === 'credit' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  fontSize: '16px',
                  color: balanceSign === 'credit' ? '#34d399' : '#f87171',
                }}
              />
            )}
          </div>
          {error ? <p className="text-xs text-center" style={{ color: '#f87171' }}>{error}</p> : null}
        </div>
        <div
          className="px-5 py-3 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)', background: 'rgba(13,17,32,0.96)' }}
        >
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-white text-base touch-manipulation"
            style={{
              background: canSubmit
                ? 'linear-gradient(135deg, #065f46 0%, #10b981 100%)'
                : 'rgba(255,255,255,0.04)',
              border: canSubmit ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(255,255,255,0.06)',
              opacity: canSubmit ? 1 : 0.5,
            }}
          >
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <Truck size={18} />}
            {t('addSupplier')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
