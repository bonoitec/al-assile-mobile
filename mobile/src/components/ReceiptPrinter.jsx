import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Receipt } from 'lucide-react';
import { t } from '../utils/i18n.js';
import ReceiptPreview from './ReceiptPreview.jsx';

/**
 * Entry point button for showing the receipt. Opens a bottom-sheet preview
 * where the cashier sees exactly what will print, then confirms with Print
 * or Share. Keeping this component as the public API so Cart.jsx / Sales.jsx
 * don't have to change — they just drop in <ReceiptPrinter sale={} settings={} />
 * and get the new flow.
 */
export default function ReceiptPrinter({ sale, settings }) {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <>
      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={() => setPreviewOpen(true)}
        className="flex items-center justify-center gap-2 w-full px-5 py-3 rounded-xl font-semibold text-sm
                   transition-all touch-manipulation"
        style={{
          background: 'rgba(212,165,116,0.1)',
          border: '1px solid rgba(212,165,116,0.2)',
          color: '#D4A574',
        }}
      >
        <Receipt size={17} />
        <span>{t('viewReceipt')}</span>
      </motion.button>

      <ReceiptPreview
        sale={sale}
        settings={settings}
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  );
}
