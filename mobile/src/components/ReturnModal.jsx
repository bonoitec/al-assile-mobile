import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw, Package, Minus, Plus, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../utils/currency.js';
import { t } from '../utils/i18n.js';

/*
  Usage:
    <ReturnModal
      sale={sale}                          // full sale object with items
      onConfirm={(returnData) => ...}      // returnData = { items, notes }
      onClose={() => ...}
    />

  onConfirm receives:
    {
      items: [{ product_id, quantity, unit_price }],
      notes: string
    }
*/

export default function ReturnModal({ sale, onConfirm, onClose }) {
  const items = useMemo(() => sale?.items || sale?.sale_items || [], [sale]);

  // State: { [index]: { checked, qty } }
  const [selections, setSelections] = useState(() =>
    items.reduce((acc, _, i) => {
      acc[i] = { checked: false, qty: 1 };
      return acc;
    }, {})
  );
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const toggleCheck = (i) => {
    setSelections(prev => ({
      ...prev,
      [i]: { ...prev[i], checked: !prev[i].checked },
    }));
  };

  const setQty = (i, delta) => {
    const item = items[i];
    const maxQty = item.quantity || 1;
    setSelections(prev => {
      const current = prev[i].qty;
      const next = Math.max(1, Math.min(maxQty, current + delta));
      return { ...prev, [i]: { ...prev[i], qty: next } };
    });
  };

  const returnTotal = useMemo(() => {
    return items.reduce((sum, item, i) => {
      const sel = selections[i];
      if (!sel?.checked) return sum;
      return sum + (item.unit_price || 0) * sel.qty;
    }, 0);
  }, [selections, items]);

  const checkedCount = Object.values(selections).filter(s => s.checked).length;
  const canSubmit = checkedCount > 0 && !submitting;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const returnItems = items
      .map((item, i) => {
        const sel = selections[i];
        if (!sel?.checked) return null;
        return {
          product_id: item.product_id || item.id,
          quantity: sel.qty,
          unit_price: item.unit_price || 0,
        };
      })
      .filter(Boolean);

    await onConfirm({ items: returnItems, notes: notes.trim() });
    setSubmitting(false);
  };

  const saleDate = sale?.created_at
    ? new Date(sale.created_at).toLocaleDateString('fr-DZ', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      })
    : '';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
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
            maxHeight: '90vh',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(239,68,68,0.12)' }}
              >
                <RotateCcw size={16} style={{ color: '#f87171' }} />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">{t('returnSale')}</h2>
                <p className="text-xs" style={{ color: '#4a5568' }}>Sale #{sale?.id}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full touch-manipulation"
              style={{ background: 'rgba(255,255,255,0.06)' }}
              aria-label="Close"
            >
              <X size={18} style={{ color: '#9ca3af' }} />
            </button>
          </div>

          {/* Sale summary */}
          <div className="px-5 pb-3 flex-shrink-0">
            <div
              className="rounded-xl px-4 py-3 grid grid-cols-3 gap-3"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              {[
                { label: t('date'), value: saleDate },
                { label: t('client'), value: sale?.client_name || t('walkin') },
                { label: t('total'), value: formatCurrency(sale?.total || 0) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: '#4a5568' }}>{label}</p>
                  <p className="text-xs font-semibold text-white truncate">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Items list */}
          <div className="flex-1 overflow-y-auto px-5 pb-3">
            <p className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: '#4a5568' }}>
              {t('selectItemsToReturn')}
            </p>

            {items.length === 0 ? (
              <div className="flex items-center gap-3 py-8 justify-center">
                <Package size={20} style={{ color: '#3d5068' }} />
                <p className="text-sm" style={{ color: '#3d5068' }}>{t('noItemDetailsAvailable')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item, i) => {
                  const sel = selections[i];
                  const maxQty = item.quantity || 1;
                  const lineReturn = sel.checked ? (item.unit_price || 0) * sel.qty : 0;

                  return (
                    <motion.div
                      key={i}
                      layout
                      className="rounded-xl p-3"
                      style={{
                        background: sel.checked ? 'rgba(239,68,68,0.07)' : 'rgba(255,255,255,0.03)',
                        border: sel.checked ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(255,255,255,0.06)',
                        transition: 'background 0.15s, border-color 0.15s',
                      }}
                    >
                      <div className="flex items-center gap-3">
                        {/* Checkbox */}
                        <button
                          onClick={() => toggleCheck(i)}
                          className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 touch-manipulation"
                          style={{
                            background: sel.checked ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)',
                            border: sel.checked ? '1.5px solid rgba(239,68,68,0.5)' : '1.5px solid rgba(255,255,255,0.12)',
                          }}
                          aria-label={sel.checked ? 'Deselect item' : 'Select item'}
                        >
                          {sel.checked && (
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6l3 3 5-5" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>

                        {/* Item info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">
                            {item.product_name || item.name || t('products')}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: '#4a5568' }}>
                            {formatCurrency(item.unit_price || 0)} × {maxQty} sold
                          </p>
                        </div>

                        {/* Return total */}
                        {sel.checked && (
                          <p className="text-sm font-bold flex-shrink-0" style={{ color: '#f87171' }}>
                            -{formatCurrency(lineReturn)}
                          </p>
                        )}
                      </div>

                      {/* Qty stepper — only when checked */}
                      <AnimatePresence>
                        {sel.checked && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="overflow-hidden"
                          >
                            <div className="flex items-center gap-3 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                              <p className="text-xs flex-1" style={{ color: '#6b7280' }}>
                                Return qty (max {maxQty}):
                              </p>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setQty(i, -1)}
                                  disabled={sel.qty <= 1}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg touch-manipulation"
                                  style={{
                                    background: 'rgba(255,255,255,0.06)',
                                    opacity: sel.qty <= 1 ? 0.3 : 1,
                                  }}
                                  aria-label="Decrease return quantity"
                                >
                                  <Minus size={13} style={{ color: '#9ca3af' }} />
                                </button>
                                <span className="w-7 text-center text-sm font-bold text-white">{sel.qty}</span>
                                <button
                                  onClick={() => setQty(i, 1)}
                                  disabled={sel.qty >= maxQty}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg touch-manipulation"
                                  style={{
                                    background: 'rgba(255,255,255,0.06)',
                                    opacity: sel.qty >= maxQty ? 0.3 : 1,
                                  }}
                                  aria-label="Increase return quantity"
                                >
                                  <Plus size={13} style={{ color: '#9ca3af' }} />
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bottom: reason + total + button */}
          <div className="flex-shrink-0 px-5 pt-3 pb-3 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            {/* Reason */}
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={t('returnReason')}
              className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-600 outline-none"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                fontSize: '16px',
              }}
            />

            {/* Return total */}
            {checkedCount > 0 && (
              <div
                className="rounded-xl px-4 py-3 flex items-center justify-between"
                style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)' }}
              >
                <div>
                  <p className="text-xs font-medium" style={{ color: '#6b7280' }}>
                    {t('returnTotal')} ({checkedCount} item{checkedCount > 1 ? 's' : ''})
                  </p>
                </div>
                <p className="text-lg font-bold" style={{ color: '#f87171' }}>
                  -{formatCurrency(returnTotal)}
                </p>
              </div>
            )}

            {/* Warning if nothing selected */}
            {checkedCount === 0 && (
              <div
                className="rounded-xl px-4 py-3 flex items-center gap-2.5"
                style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.15)' }}
              >
                <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
                <p className="text-xs" style={{ color: '#f59e0b' }}>{t('selectAtLeastOne')}</p>
              </div>
            )}

            {/* Confirm button */}
            <button
              onClick={handleConfirm}
              disabled={!canSubmit}
              className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl
                         font-bold text-white text-base touch-manipulation transition-all"
              style={{
                background: canSubmit
                  ? 'linear-gradient(135deg, #7f1d1d 0%, #ef4444 100%)'
                  : 'rgba(255,255,255,0.04)',
                border: canSubmit ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(255,255,255,0.06)',
                opacity: canSubmit ? 1 : 0.4,
              }}
            >
              {submitting ? (
                <>
                  <div className="w-5 h-5 border-2 rounded-full animate-spin"
                    style={{ borderColor: 'rgba(255,255,255,0.2)', borderTopColor: '#fff' }} />
                  {t('returning')}
                </>
              ) : (
                <>
                  <RotateCcw size={18} />
                  {t('processReturn')}
                  {returnTotal > 0 && ` — ${formatCurrency(returnTotal)}`}
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
