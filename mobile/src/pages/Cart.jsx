import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Trash2, Plus, Minus, X, ShoppingBag, ChevronRight,
  User, CheckCircle2, PartyPopper, AlertTriangle, Tag, XCircle, Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../hooks/useCart.jsx';
import { useApi } from '../hooks/useApi.jsx';
import { formatCurrency } from '../utils/currency.js';
import ClientSelector from '../components/ClientSelector.jsx';
import PaymentModal from '../components/PaymentModal.jsx';
import ReceiptPrinter from '../components/ReceiptPrinter.jsx';
import { t } from '../utils/i18n.js';

export default function Cart() {
  const navigate = useNavigate();
  const api = useApi();
  const { getItemsArray, updateQuantity, removeItem, client, setClient, clear, getTotal } = useCart();

  const [showClientModal, setShowClientModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState({});
  const [discountInput, setDiscountInput] = useState('');

  useEffect(() => {
    api.get('/api/settings').then(setSettings).catch(() => {});
  }, []);

  const items = getItemsArray();
  const subtotal = getTotal();
  const discount = Math.min(
    Math.max(parseFloat(discountInput.replace(',', '.') || '0') || 0, 0),
    subtotal
  );
  const total = subtotal - discount;
  const isEmpty = items.length === 0;

  const handleCompleteSale = async (paymentData) => {
    setShowPaymentModal(false);
    setCompleting(true);
    setError('');

    try {
      const payload = {
        client_id: client?.id || null,
        date: new Date().toISOString().split('T')[0],
        paid_amount: paymentData.amount_paid || 0,
        payment_method: paymentData.payment_method || 'cash',
        notes: paymentData.notes || null,
        discount: discount > 0 ? discount : undefined,
        items: items.map(({ product, quantity }) => ({
          product_id: product.id,
          quantity,
          unit_price: product.selling_price,
        })),
      };

      const sale = await api.post('/api/sales', payload);
      setCompletedSale({ ...sale, client_name: client?.name || null });
      clear();
    } catch (err) {
      setError(err.message || t('failedToCreateSale'));
    } finally {
      setCompleting(false);
    }
  };

  // Cancel a sale that was JUST completed. Server restores stock, reverses
  // balance, deletes sale + items, and logs a 'delete' sync_log entry so
  // the desktop mirrors the cancellation on its next pull.
  const handleCancelSale = async () => {
    if (!completedSale?.id || cancelling) return;
    setCancelling(true);
    setError('');
    try {
      await api.delete(`/api/sales/${completedSale.id}`);
      setCompletedSale(null);
      setCancelConfirm(false);
      navigate('/');
    } catch (err) {
      setError(err.message || t('cancelSaleFailed'));
      setCancelConfirm(false);
    } finally {
      setCancelling(false);
    }
  };

  // Post-sale success screen
  if (completedSale) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-6 text-center safe-top"
        style={{ background: '#080c14' }}>
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 18 }}
          className="flex flex-col items-center gap-5 w-full max-w-sm"
        >
          {/* Success icon */}
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(16,185,129,0.12)', border: '2px solid rgba(16,185,129,0.3)' }}
          >
            <CheckCircle2 size={40} style={{ color: '#10b981' }} />
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white mb-1">{t('saleComplete')}</h2>
            <p className="text-sm" style={{ color: '#6b7280' }}>
              {completedSale.client_name
                ? `${t('soldTo')} ${completedSale.client_name}`
                : t('walkinSaleRecorded')}
            </p>
            <p className="text-3xl font-bold mt-3" style={{ color: '#D4A574' }}>
              {formatCurrency(completedSale.total || 0)}
            </p>
          </div>

          {/* Receipt / Cancel / new sale buttons */}
          <div className="w-full flex flex-col gap-3 mt-2">
            {/* Row 1: Receipt + Cancel side by side */}
            <div className="w-full flex gap-2">
              <div className="flex-1">
                <ReceiptPrinter sale={completedSale} settings={settings} />
              </div>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => setCancelConfirm(true)}
                disabled={cancelling}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl
                           font-semibold text-sm touch-manipulation"
                style={{
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  color: '#f87171',
                  opacity: cancelling ? 0.5 : 1,
                }}
              >
                {cancelling ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                <span>{t('cancelSale')}</span>
              </motion.button>
            </div>

            {error && (
              <p className="text-xs text-center" style={{ color: '#f87171' }}>{error}</p>
            )}

            <button
              onClick={() => { setCompletedSale(null); navigate('/'); }}
              className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl
                         font-bold text-white text-base touch-manipulation"
              style={{
                background: 'linear-gradient(135deg, #8B6914 0%, #D4A574 100%)',
                border: '1px solid rgba(212,165,116,0.3)',
              }}
            >
              <ShoppingBag size={20} />
              {t('newSale')}
            </button>

            <button
              onClick={() => navigate('/sales')}
              className="py-3 text-sm font-medium touch-manipulation"
              style={{ color: '#4a5568' }}
            >
              {t('viewTodaysSales')}
            </button>
          </div>
        </motion.div>

        {/* Cancel confirmation — non-destructive default; user must explicitly tap confirm */}
        <AnimatePresence>
          {cancelConfirm && (
            <motion.div
              className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-6"
              style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !cancelling && setCancelConfirm(false)}
            >
              <motion.div
                className="w-full max-w-sm rounded-2xl p-5"
                style={{ background: '#0a0a0a', border: '1px solid rgba(239,68,68,0.3)' }}
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 40, opacity: 0 }}
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                       style={{ background: 'rgba(239,68,68,0.15)' }}>
                    <AlertTriangle size={20} style={{ color: '#f87171' }} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white mb-1">{t('cancelSaleConfirm')}</h3>
                    <p className="text-sm" style={{ color: '#9ca3af' }}>{t('cancelSaleConfirmDesc')}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCancelConfirm(false)}
                    disabled={cancelling}
                    className="flex-1 py-3 rounded-xl font-semibold text-sm touch-manipulation"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#e5e7eb',
                    }}
                  >
                    {t('keepSale')}
                  </button>
                  <button
                    onClick={handleCancelSale}
                    disabled={cancelling}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm touch-manipulation"
                    style={{
                      background: 'rgba(239,68,68,0.15)',
                      border: '1px solid rgba(239,68,68,0.4)',
                      color: '#f87171',
                    }}
                  >
                    {cancelling && <Loader2 size={16} className="animate-spin" />}
                    {t('confirmCancel')}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ background: '#080c14' }}>
      {/* Header */}
      <div
        className="flex-shrink-0 safe-top"
        style={{ background: 'rgba(8,12,20,0.97)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div className="flex items-center gap-3 px-4 pt-2 pb-4">
          <button
            onClick={() => navigate('/')}
            className="w-10 h-10 flex items-center justify-center rounded-full touch-manipulation"
            style={{ background: 'rgba(255,255,255,0.05)' }}
            aria-label={t('backToProducts')}
          >
            <ArrowLeft size={20} style={{ color: '#9ca3af' }} />
          </button>

          <h1 className="text-xl font-bold text-white flex-1">{t('cart')}</h1>

          {!isEmpty && (
            <button
              onClick={clear}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold touch-manipulation"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}
              aria-label={t('clearCart')}
            >
              <Trash2 size={14} />
              {t('clear')}
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-5">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center"
            style={{ background: 'rgba(212,165,116,0.07)', border: '1px solid rgba(212,165,116,0.12)' }}
          >
            <ShoppingBag size={36} style={{ color: '#D4A574', opacity: 0.5 }} />
          </div>
          <div>
            <p className="text-xl font-bold text-white mb-1">{t('cartEmpty')}</p>
            <p className="text-sm" style={{ color: '#3d5068' }}>{t('addProductsToStart')}</p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 rounded-xl text-sm font-semibold touch-manipulation"
            style={{
              background: 'linear-gradient(135deg, #8B6914 0%, #D4A574 100%)',
              color: '#fff',
              border: '1px solid rgba(212,165,116,0.3)',
            }}
          >
            {t('browseProducts')}
          </button>
        </div>
      )}

      {/* Cart content */}
      {!isEmpty && (
        <>
          <div className="flex-1 overflow-y-auto scroll-touch px-4 py-4 space-y-3">
            {/* Cart items */}
            <AnimatePresence initial={false}>
              {items.map(({ product, quantity }) => {
                const lineTotal = product.selling_price * quantity;
                const maxQty = product.quantity ?? 999;

                return (
                  <motion.div
                    key={product.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 40, transition: { duration: 0.15 } }}
                    className="flex items-center gap-3 p-3 rounded-2xl"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    {/* Remove */}
                    <button
                      onClick={() => removeItem(product.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-full flex-shrink-0 touch-manipulation"
                      style={{ background: 'rgba(239,68,68,0.1)' }}
                      aria-label={`Remove ${product.name}`}
                    >
                      <X size={14} style={{ color: '#f87171' }} />
                    </button>

                    {/* Name & price */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{product.name}</p>
                      <p className="text-xs" style={{ color: '#4a5568' }}>
                        {formatCurrency(product.selling_price)} {t('each')}
                      </p>
                    </div>

                    {/* Qty stepper */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(product.id, quantity - 1)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg touch-manipulation"
                        style={{ background: 'rgba(255,255,255,0.06)' }}
                        aria-label={t('decreaseQty')}
                      >
                        <Minus size={14} style={{ color: '#9ca3af' }} />
                      </button>
                      <span className="w-7 text-center text-sm font-bold text-white">{quantity}</span>
                      <button
                        onClick={() => updateQuantity(product.id, quantity + 1)}
                        disabled={quantity >= maxQty}
                        className="w-8 h-8 flex items-center justify-center rounded-lg touch-manipulation"
                        style={{
                          background: quantity >= maxQty ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.06)',
                          opacity: quantity >= maxQty ? 0.4 : 1,
                        }}
                        aria-label={t('increaseQty')}
                      >
                        <Plus size={14} style={{ color: '#9ca3af' }} />
                      </button>
                    </div>

                    {/* Line total */}
                    <p className="text-sm font-bold text-right" style={{ color: '#D4A574', minWidth: '72px' }}>
                      {formatCurrency(lineTotal)}
                    </p>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Client selector */}
            <button
              onClick={() => setShowClientModal(true)}
              className="w-full flex items-center gap-3 p-4 rounded-2xl touch-manipulation"
              style={{
                background: client ? 'rgba(212,165,116,0.07)' : 'rgba(255,255,255,0.03)',
                border: client ? '1px solid rgba(212,165,116,0.2)' : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: client ? 'rgba(212,165,116,0.15)' : 'rgba(255,255,255,0.05)' }}
              >
                <User size={18} style={{ color: client ? '#D4A574' : '#4a5568' }} />
              </div>
              <div className="flex-1 text-left">
                <p className="text-xs font-medium uppercase tracking-wide mb-0.5" style={{ color: '#4a5568' }}>
                  {t('client')}
                </p>
                <p className="text-sm font-semibold" style={{ color: client ? '#fff' : '#6b7280' }}>
                  {client ? client.name : t('walkinCustomer')}
                </p>
              </div>
              <ChevronRight size={18} style={{ color: '#3d5068' }} />
            </button>

            {/* Client debt warning */}
            {client && typeof client.balance === 'number' && client.balance > 0 && (
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.18)',
                }}
              >
                <AlertTriangle size={16} className="flex-shrink-0" style={{ color: '#f87171' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold" style={{ color: '#f87171' }}>
                    {t('clientOwes')} {formatCurrency(client.balance)}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
                    {t('existingBalance')}
                  </p>
                </div>
              </div>
            )}

            {/* Discount input */}
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-2xl"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: discount > 0
                  ? '1px solid rgba(212,165,116,0.25)'
                  : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  background: discount > 0 ? 'rgba(212,165,116,0.15)' : 'rgba(255,255,255,0.05)',
                }}
              >
                <Tag size={16} style={{ color: discount > 0 ? '#D4A574' : '#4a5568' }} />
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: '#4a5568' }}>
                  {t('discount')}
                </p>
                <input
                  type="number"
                  inputMode="decimal"
                  value={discountInput}
                  onChange={e => setDiscountInput(e.target.value)}
                  placeholder="0"
                  min="0"
                  className="w-full bg-transparent text-white outline-none text-sm font-semibold placeholder-gray-700"
                  style={{ fontSize: '14px' }}
                />
              </div>
              {discount > 0 && (
                <span className="text-xs font-semibold flex-shrink-0" style={{ color: '#D4A574' }}>
                  -{formatCurrency(discount)}
                </span>
              )}
            </div>

            {/* Error */}
            {error && (
              <div
                className="px-4 py-3 rounded-xl text-sm"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}
              >
                {error}
              </div>
            )}
          </div>

          {/* Summary + checkout */}
          <div
            className="flex-shrink-0 px-4 py-4 space-y-3"
            style={{
              background: 'rgba(8,12,20,0.97)',
              borderTop: '1px solid rgba(255,255,255,0.05)',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 4rem)',
            }}
          >
            {/* Total summary */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: '#6b7280' }}>
                  {items.reduce((s, { quantity }) => s + quantity, 0)} {t('items')}
                </span>
                <span className="text-sm font-medium" style={{ color: '#9ca3af' }}>
                  {formatCurrency(subtotal)}
                </span>
              </div>
              {discount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: '#D4A574' }}>{t('discount')}</span>
                  <span className="text-sm font-semibold" style={{ color: '#D4A574' }}>
                    -{formatCurrency(discount)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="text-sm font-semibold text-white">{t('total')}</span>
                <p className="text-2xl font-bold" style={{ color: '#D4A574' }}>{formatCurrency(total)}</p>
              </div>
            </div>

            {/* Checkout button */}
            <button
              onClick={() => setShowPaymentModal(true)}
              disabled={completing}
              className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl
                         font-bold text-white text-base touch-manipulation"
              style={{
                background: completing
                  ? 'rgba(255,255,255,0.05)'
                  : 'linear-gradient(135deg, #065f46 0%, #10b981 100%)',
                border: '1px solid rgba(16,185,129,0.3)',
                opacity: completing ? 0.6 : 1,
              }}
            >
              {completing ? (
                <>
                  <div className="w-5 h-5 border-2 rounded-full animate-spin"
                    style={{ borderColor: 'rgba(255,255,255,0.2)', borderTopColor: '#fff' }} />
                  {t('processing')}
                </>
              ) : (
                <>
                  <CheckCircle2 size={20} />
                  {t('checkout')} — {formatCurrency(total)}
                </>
              )}
            </button>
          </div>
        </>
      )}

      {/* Client selector modal */}
      {showClientModal && (
        <ClientSelector
          selected={client}
          onSelect={setClient}
          onClose={() => setShowClientModal(false)}
        />
      )}

      {/* Payment modal */}
      {showPaymentModal && (
        <PaymentModal
          total={total}
          hasClient={!!client}
          clientName={client?.name || null}
          onConfirm={handleCompleteSale}
          onClose={() => setShowPaymentModal(false)}
        />
      )}
    </div>
  );
}
