import React, { useEffect, useRef, useState, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ScanLine, Check, AlertTriangle } from 'lucide-react';
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
  // Unique DOM id per mount — html5-qrcode targets by id, so reusing a singleton
  // "barcode-reader" across rapid open/close/open can race with an in-flight
  // previous instance that still holds the node. useId() makes each mount
  // address its own private element.
  const readerId = useId().replace(/:/g, '-') + '-barcode-reader';

  // Success flash state — covers the viewfinder on scan so the user sees a
  // green check instead of a black frame during MediaStream release.
  const [scanned, setScanned] = useState(false);
  // User-facing error (camera denied, no camera, etc.) — replaces the silent
  // empty-viewfinder state where the modal would just look frozen.
  const [startError, setStartError] = useState(null);

  // Keep onScan fresh via a ref so the effect (which only re-runs on isOpen)
  // always calls the LATEST handler. Without this, mid-session updates to the
  // `products` list that regenerate handleBarcodeScan would be ignored.
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Tracked close-after-success timer so we can cancel it if the user dismisses
  // the modal manually during the 180ms window.
  const closeTimerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setScanned(false);
      setStartError(null);
      return;
    }

    let html5QrcodeInstance = null;
    let stopped = false;

    const startScanner = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');

        // Wait for the DOM element to be available
        await new Promise(resolve => setTimeout(resolve, 100));

        if (stopped || !document.getElementById(readerId)) return;

        html5QrcodeInstance = new Html5Qrcode(readerId);
        scannerRef.current = html5QrcodeInstance;

        await html5QrcodeInstance.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            if (stopped) return;
            stopped = true;

            // Show the success overlay IMMEDIATELY so the user gets instant
            // visual confirmation instead of a black viewfinder while the
            // MediaStream releases (100-500ms on mobile).
            setScanned(true);

            // Deliver the scan right away via ref (fresh handler, not stale).
            try { onScanRef.current && onScanRef.current(decodedText); }
            catch (e) { console.error('onScan handler threw:', e); }

            // Stop the camera in the background; the cleanup effect will also
            // call stop() when isOpen flips to false. Both are safe (catch swallows).
            html5QrcodeInstance.stop().catch(() => {});

            // Close the modal after a short beat so the success state is visible.
            closeTimerRef.current = setTimeout(() => {
              closeTimerRef.current = null;
              onCloseRef.current && onCloseRef.current();
            }, 180);
          },
          () => {
            // Scan error — suppress, happens constantly while scanning
          }
        );
      } catch (err) {
        console.error('BarcodeScanner start error:', err);
        // Translate common errors into user-facing messages. The modal otherwise
        // just shows an empty black viewfinder and users think it's frozen.
        const msg = String(err && (err.message || err.name) || '');
        if (/NotAllowed|Permission|denied/i.test(msg)) {
          setStartError('permission');
        } else if (/NotFound|NotReadable|camera/i.test(msg)) {
          setStartError('no-camera');
        } else if (/Not supported|secure/i.test(msg)) {
          setStartError('insecure');
        } else {
          setStartError('unknown');
        }
      }
    };

    startScanner();

    return () => {
      stopped = true;
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [isOpen, readerId]);

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
            aria-label={t('closeScanner')}
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

            {/* The actual scanner element — unique id per mount */}
            <div
              id={readerId}
              className="w-full h-full rounded-2xl overflow-hidden"
              style={{ background: '#000' }}
            />

            {/* Error overlay — shown when camera start fails (permission denied,
                no camera, HTTP context). Replaces the silent black viewfinder. */}
            <AnimatePresence>
              {startError && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center px-6 text-center"
                  style={{ background: 'rgba(185,28,28,0.94)' }}
                  role="alert"
                >
                  <AlertTriangle size={36} style={{ color: '#fff' }} />
                  <p className="mt-3 text-white font-semibold text-sm">
                    {startError === 'permission' ? t('cameraPermissionDenied')
                      : startError === 'no-camera' ? t('noCameraFound')
                      : startError === 'insecure' ? t('cameraNeedsHttps')
                      : t('cameraUnavailable')}
                  </p>
                  <p className="mt-2 text-xs" style={{ color: 'rgba(255,255,255,0.75)' }}>
                    {startError === 'permission'
                      ? t('cameraPermissionHint')
                      : ''}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Success overlay — covers the viewfinder the instant a scan succeeds
                so the user sees a green check instead of the black frame that
                results while the MediaStream is releasing. */}
            <AnimatePresence>
              {scanned && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="absolute inset-0 rounded-2xl flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, rgba(16,185,129,0.92) 0%, rgba(5,150,105,0.92) 100%)',
                  }}
                >
                  <motion.div
                    initial={{ scale: 0.5 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                    className="w-20 h-20 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.25)' }}
                  >
                    <Check size={44} strokeWidth={3} style={{ color: '#fff' }} />
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Scanning status — aria-live so a screen reader announces the scan result */}
          <div className="mt-8 flex items-center gap-2" aria-live="polite" aria-atomic="true">
            <div
              className="w-2 h-2 rounded-full"
              style={{
                background: scanned ? '#10b981' : '#D4A574',
                animation: scanned ? 'none' : 'statusBlink 1.2s ease-in-out infinite',
              }}
            />
            <p className="text-sm font-medium" style={{ color: scanned ? '#10b981' : '#8B7355' }}>
              {scanned ? t('scanned') : t('scanning')}
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
