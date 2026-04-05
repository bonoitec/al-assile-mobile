import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Printer, Share2, Check, Loader2, Bluetooth, BluetoothOff } from 'lucide-react';
import { connectPrinter, printReceipt, isSupported, isConnected, formatReceiptText } from '../utils/bluetooth.js';
import { t } from '../utils/i18n.js';

export default function ReceiptPrinter({ sale, settings }) {
  const [status, setStatus] = useState('idle'); // idle | connecting | printing | done | error
  const [message, setMessage] = useState('');

  const bluetooth = isSupported();

  const handlePrint = async () => {
    if (status === 'connecting' || status === 'printing') return;

    try {
      if (!isConnected()) {
        setStatus('connecting');
        setMessage(t('searchingPrinter'));
        await connectPrinter();
      }

      setStatus('printing');
      setMessage(t('sendingReceipt'));
      await printReceipt(sale, settings);
      setStatus('done');
      setMessage(t('receiptPrinted'));

      setTimeout(() => {
        setStatus('idle');
        setMessage('');
      }, 3000);
    } catch (err) {
      setStatus('error');
      setMessage(err.message || t('printFailed'));
      setTimeout(() => {
        setStatus('idle');
        setMessage('');
      }, 4000);
    }
  };

  const handleShare = () => {
    const text = formatReceiptText(sale, settings);
    if (navigator.share) {
      navigator.share({ title: 'Receipt', text }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setStatus('done');
        setMessage(t('receiptCopied'));
        setTimeout(() => { setStatus('idle'); setMessage(''); }, 3000);
      }).catch(() => {
        setStatus('error');
        setMessage(t('couldNotCopy'));
        setTimeout(() => { setStatus('idle'); setMessage(''); }, 3000);
      });
    }
  };

  if (!bluetooth) {
    return (
      <button
        onClick={handleShare}
        className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm
                   transition-all touch-manipulation"
        style={{
          background: 'rgba(212,165,116,0.1)',
          border: '1px solid rgba(212,165,116,0.2)',
          color: '#D4A574',
        }}
      >
        {status === 'done' ? (
          <>
            <Check size={17} />
            <span>{message}</span>
          </>
        ) : (
          <>
            <Share2 size={17} />
            <span>{t('shareReceipt')}</span>
          </>
        )}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={handlePrint}
        disabled={status === 'connecting' || status === 'printing'}
        className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm
                   transition-all touch-manipulation"
        style={{
          background:
            status === 'done'
              ? 'rgba(16,185,129,0.15)'
              : status === 'error'
                ? 'rgba(239,68,68,0.1)'
                : 'rgba(212,165,116,0.1)',
          border:
            status === 'done'
              ? '1px solid rgba(16,185,129,0.3)'
              : status === 'error'
                ? '1px solid rgba(239,68,68,0.2)'
                : '1px solid rgba(212,165,116,0.2)',
          color:
            status === 'done'
              ? '#34d399'
              : status === 'error'
                ? '#f87171'
                : '#D4A574',
          opacity: (status === 'connecting' || status === 'printing') ? 0.7 : 1,
        }}
      >
        {status === 'idle' && <><Printer size={17} /><span>{t('printReceipt')}</span></>}
        {status === 'connecting' && <><Bluetooth size={17} className="animate-pulse" /><span>{t('connecting')}</span></>}
        {status === 'printing' && <><Loader2 size={17} className="animate-spin" /><span>{t('printing')}</span></>}
        {status === 'done' && <><Check size={17} /><span>{t('printed')}</span></>}
        {status === 'error' && <><BluetoothOff size={17} /><span>{t('printFailed')}</span></>}
      </motion.button>

      {message && (
        <p className="text-xs text-center" style={{ color: '#6b7280' }}>{message}</p>
      )}

      {status === 'error' && (
        <button
          onClick={handleShare}
          className="text-xs underline"
          style={{ color: '#D4A574' }}
        >
          {t('shareInstead')}
        </button>
      )}
    </div>
  );
}
