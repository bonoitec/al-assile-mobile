import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CreditCard, Banknote, CheckCircle2, ChevronRight, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../utils/currency.js';
import { t } from '../utils/i18n.js';

export default function PaymentModal({ total, hasClient, onConfirm, onClose }) {
  const [amountPaid, setAmountPaid] = useState('');
  const [method, setMethod] = useState('cash'); // 'cash' | 'credit'
  const [notes, setNotes] = useState('');

  const numericPaid = parseFloat(amountPaid.replace(',', '.') || '0') || 0;
  const change = numericPaid - total;
  const isCredit = method === 'credit';

  const paymentStatus =
    isCredit
      ? 'credit'
      : numericPaid >= total
        ? numericPaid > total ? 'overpaid' : 'exact'
        : 'partial';

  const isPartial = !isCredit && numericPaid > 0 && numericPaid < total;
  const needsClient = isCredit || isPartial;
  const canComplete = (isCredit || numericPaid > 0) && (!needsClient || hasClient);

  const quickAmounts = [
    { label: t('exact'), value: total },
    { label: Math.ceil(total / 100) * 100, value: Math.ceil(total / 100) * 100 },
    { label: Math.ceil(total / 500) * 500, value: Math.ceil(total / 500) * 500 },
    { label: Math.ceil(total / 1000) * 1000, value: Math.ceil(total / 1000) * 1000 },
  ].filter((q, idx, arr) => idx === 0 || q.value !== arr[0].value);

  const handleDigit = (d) => {
    setAmountPaid(prev => {
      if (d === '.' && prev.includes('.')) return prev;
      if (d === '.' && !prev) return '0.';
      return prev + d;
    });
  };

  const handleBackspace = () => {
    setAmountPaid(prev => prev.slice(0, -1));
  };

  const handleComplete = () => {
    onConfirm({
      amount_paid: isCredit ? 0 : numericPaid,
      payment_method: method,
      notes: notes.trim(),
      payment_status: paymentStatus === 'credit' ? 'credit'
        : numericPaid >= total ? 'paid' : 'partial',
    });
  };

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
            maxHeight: '85vh',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
          </div>

          {/* Header - fixed */}
          <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
            <h2 className="text-lg font-bold text-white">{t('payment')}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full"
              style={{ background: 'rgba(255,255,255,0.06)' }}
              aria-label="Close"
            >
              <X size={18} style={{ color: '#9ca3af' }} />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto scroll-touch">

          {/* Total */}
          <div className="px-5 pb-4">
            <div
              className="rounded-2xl p-4 flex items-center justify-between"
              style={{ background: 'rgba(212,165,116,0.07)', border: '1px solid rgba(212,165,116,0.15)' }}
            >
              <span className="text-sm font-medium" style={{ color: '#8B7355' }}>{t('totalDue')}</span>
              <span className="text-2xl font-bold" style={{ color: '#D4A574' }}>{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Payment method toggle */}
          <div className="px-5 pb-4">
            <div
              className="flex rounded-xl p-1"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              {[
                { id: 'cash', label: t('cash'), icon: Banknote },
                { id: 'credit', label: t('credit'), icon: CreditCard },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setMethod(id)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg
                             text-sm font-semibold transition-all touch-manipulation"
                  style={{
                    background: method === id ? 'rgba(212,165,116,0.15)' : 'transparent',
                    color: method === id ? '#D4A574' : '#4a5568',
                    border: method === id ? '1px solid rgba(212,165,116,0.25)' : '1px solid transparent',
                  }}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {!isCredit && (
            <>
              {/* Amount display */}
              <div className="px-5 pb-3">
                <div
                  className="rounded-xl px-4 py-3 text-right"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <p className="text-xs font-medium mb-1" style={{ color: '#4a5568' }}>{t('amountPaid')}</p>
                  <p className="text-2xl font-bold text-white">
                    {amountPaid ? formatCurrency(numericPaid) : <span style={{ color: '#2a3a52' }}>0.00 DA</span>}
                  </p>
                </div>

                {/* Quick amounts */}
                <div className="flex gap-2 mt-2">
                  {quickAmounts.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => setAmountPaid(String(q.value))}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold touch-manipulation transition-colors"
                      style={{
                        background: numericPaid === q.value ? 'rgba(212,165,116,0.15)' : 'rgba(255,255,255,0.04)',
                        border: numericPaid === q.value ? '1px solid rgba(212,165,116,0.3)' : '1px solid rgba(255,255,255,0.06)',
                        color: numericPaid === q.value ? '#D4A574' : '#6b7280',
                      }}
                    >
                      {i === 0 ? t('exact') : formatCurrency(q.value)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Keypad */}
              <div className="px-5 pb-3 grid grid-cols-3 gap-2">
                {['1','2','3','4','5','6','7','8','9','.','0','⌫'].map(key => (
                  <button
                    key={key}
                    onClick={() => key === '⌫' ? handleBackspace() : handleDigit(key)}
                    className="py-3 rounded-xl text-base font-semibold touch-manipulation transition-all active:scale-95"
                    style={{
                      background: key === '⌫' ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)',
                      border: key === '⌫' ? '1px solid rgba(239,68,68,0.1)' : '1px solid rgba(255,255,255,0.06)',
                      color: key === '⌫' ? '#f87171' : '#fff',
                    }}
                  >
                    {key}
                  </button>
                ))}
              </div>

              {/* Change / Due display */}
              {numericPaid > 0 && (
                <div className="px-5 pb-3">
                  <div
                    className="rounded-xl px-4 py-3 flex items-center justify-between"
                    style={{
                      background: change >= 0 ? 'rgba(16,185,129,0.07)' : 'rgba(245,158,11,0.07)',
                      border: change >= 0 ? '1px solid rgba(16,185,129,0.15)' : '1px solid rgba(245,158,11,0.15)',
                    }}
                  >
                    <span className="text-sm font-medium" style={{ color: change >= 0 ? '#34d399' : '#f59e0b' }}>
                      {change >= 0 ? t('change') : t('remaining')}
                    </span>
                    <span className="text-lg font-bold" style={{ color: change >= 0 ? '#34d399' : '#f59e0b' }}>
                      {formatCurrency(Math.abs(change))}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {isCredit && (
            <div className="px-5 pb-4">
              <div
                className="rounded-xl p-4 text-center"
                style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}
              >
                <p className="text-sm font-semibold" style={{ color: '#f59e0b' }}>
                  {t('fullCreditNotice')}
                </p>
                <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
                  {formatCurrency(total)} {t('addedToBalance')}
                </p>
              </div>
            </div>
          )}

          {/* Client required warning for partial/credit */}
          {needsClient && !hasClient && (
            <div className="px-5 pb-4">
              <div
                className="rounded-xl p-4 flex items-start gap-3"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}
              >
                <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" style={{ color: '#f87171' }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#f87171' }}>
                    {t('clientRequired')}
                  </p>
                  <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
                    {t('clientRequiredDesc')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Remaining balance info for partial payments */}
          {isPartial && hasClient && (
            <div className="px-5 pb-4">
              <div
                className="rounded-xl p-4 flex items-center justify-between"
                style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}
              >
                <div>
                  <p className="text-xs font-medium" style={{ color: '#6b7280' }}>{t('remainingDebt')}</p>
                  <p className="text-sm font-bold" style={{ color: '#f59e0b' }}>
                    {formatCurrency(total - numericPaid)} {t('willBeAddedToBalance')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="px-5 pb-4">
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={t('notesOptional')}
              className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-600 outline-none"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                fontSize: '16px',
              }}
            />
          </div>

          {/* Complete button */}
          <div className="px-5 pb-4">
            <button
              onClick={handleComplete}
              disabled={!canComplete}
              className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl
                         font-bold text-white text-base touch-manipulation transition-all"
              style={{
                background: canComplete
                  ? 'linear-gradient(135deg, #065f46 0%, #10b981 100%)'
                  : 'rgba(255,255,255,0.04)',
                border: canComplete ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(255,255,255,0.06)',
                opacity: canComplete ? 1 : 0.4,
              }}
            >
              <CheckCircle2 size={20} />
              <span>{t('completeSale')}</span>
              <ChevronRight size={18} />
            </button>
          </div>

          </div>{/* end scrollable content */}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
