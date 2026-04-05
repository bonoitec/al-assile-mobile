import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ScanLine } from 'lucide-react';
import { t } from '../utils/i18n.js';

/*
  Usage:
    <BarcodeScanner
      isOpen={showScanner}
      onScan={(barcode) => handleBarcodeScan(barcode)}
      onClose={() => setShowScanner(false)}
    />
*/

export default function BarcodeScanner({ isOpen, onScan, onClose }) {
  const scannerRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    let html5QrcodeInstance = null;
    let stopped = false;

    const startScanner = async () => {
      try {
        // Dynamically import to avoid issues if library not loaded
        const { Html5Qrcode } = await import('html5-qrcode');

        // Wait for the DOM element to be available
        await new Promise(resolve => setTimeout(resolve, 100));

        if (stopped || !document.getElementById('barcode-reader')) return;

        html5QrcodeInstance = new Html5Qrcode('barcode-reader');
        scannerRef.current = html5QrcodeInstance;

        await html5QrcodeInstance.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            if (stopped) return;
            stopped = true;
            html5QrcodeInstance.stop().catch(() => {}).finally(() => {
              onScan(decodedText);
              onClose();
            });
          },
          () => {
            // Scan error — suppress, happens constantly while scanning
          }
        );
      } catch (err) {
        console.error('BarcodeScanner start error:', err);
      }
    };

    startScanner();

    return () => {
      stopped = true;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(6px)' }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-safe right-4 w-11 h-11 flex items-center justify-center rounded-full z-10 touch-manipulation"
            style={{
              top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
            aria-label="Close scanner"
          >
            <X size={20} style={{ color: '#fff' }} />
          </button>

          {/* Title */}
          <div className="mb-8 text-center px-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              <ScanLine size={20} style={{ color: '#D4A574' }} />
              <h2 className="text-lg font-bold text-white">{t('scanBarcode')}</h2>
            </div>
            <p className="text-sm" style={{ color: '#4a5568' }}>
              {t('pointCamera')}
            </p>
          </div>

          {/* Camera viewfinder */}
          <div className="relative" style={{ width: 300, height: 300 }}>
            {/* Animated border */}
            <div
              className="absolute inset-0 rounded-2xl"
              style={{
                border: '2px solid rgba(212,165,116,0.6)',
                animation: 'scannerPulse 2s ease-in-out infinite',
                boxShadow: '0 0 20px rgba(212,165,116,0.2), inset 0 0 20px rgba(212,165,116,0.05)',
              }}
            />

            {/* Corner accents */}
            {[
              { top: -2, left: -2, borderTop: '3px solid #D4A574', borderLeft: '3px solid #D4A574', borderTopLeftRadius: 12 },
              { top: -2, right: -2, borderTop: '3px solid #D4A574', borderRight: '3px solid #D4A574', borderTopRightRadius: 12 },
              { bottom: -2, left: -2, borderBottom: '3px solid #D4A574', borderLeft: '3px solid #D4A574', borderBottomLeftRadius: 12 },
              { bottom: -2, right: -2, borderBottom: '3px solid #D4A574', borderRight: '3px solid #D4A574', borderBottomRightRadius: 12 },
            ].map((style, i) => (
              <div
                key={i}
                className="absolute"
                style={{ width: 24, height: 24, ...style }}
              />
            ))}

            {/* Scan line animation */}
            <div
              className="absolute left-2 right-2"
              style={{
                height: 2,
                background: 'linear-gradient(90deg, transparent, #D4A574, transparent)',
                animation: 'scanLine 1.8s ease-in-out infinite',
                borderRadius: 1,
              }}
            />

            {/* The actual scanner element */}
            <div
              id="barcode-reader"
              ref={containerRef}
              className="w-full h-full rounded-2xl overflow-hidden"
              style={{ background: '#000' }}
            />
          </div>

          {/* Scanning status */}
          <div className="mt-8 flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{
                background: '#D4A574',
                animation: 'statusBlink 1.2s ease-in-out infinite',
              }}
            />
            <p className="text-sm font-medium" style={{ color: '#8B7355' }}>
              {t('scanning')}
            </p>
          </div>

          {/* Inline keyframes */}
          <style>{`
            @keyframes scannerPulse {
              0%, 100% { border-color: rgba(212,165,116,0.5); box-shadow: 0 0 16px rgba(212,165,116,0.15); }
              50%       { border-color: rgba(212,165,116,0.9); box-shadow: 0 0 28px rgba(212,165,116,0.35); }
            }
            @keyframes scanLine {
              0%   { top: 10%; opacity: 0; }
              10%  { opacity: 1; }
              90%  { opacity: 1; }
              100% { top: 88%; opacity: 0; }
            }
            @keyframes statusBlink {
              0%, 100% { opacity: 1; }
              50%       { opacity: 0.3; }
            }
            /* Suppress the html5-qrcode header */
            #barcode-reader > div:first-child { display: none !important; }
            #barcode-reader video { width: 100% !important; height: 100% !important; object-fit: cover; }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
