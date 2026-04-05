import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Package, Check } from 'lucide-react';
import { formatCurrency } from '../utils/currency.js';
import { t } from '../utils/i18n.js';

export default function ProductCard({ product, onAdd, isInCart }) {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const isOutOfStock = (product.quantity ?? 0) <= 0;
  const isLowStock =
    !isOutOfStock &&
    (product.min_stock_alert ?? 0) > 0 &&
    product.quantity <= product.min_stock_alert;

  const handleTap = () => {
    if (isOutOfStock) return;
    onAdd(product);
  };

  return (
    <motion.button
      whileTap={isOutOfStock ? {} : { scale: 0.94 }}
      onClick={handleTap}
      disabled={isOutOfStock}
      aria-label={`${product.name}, ${formatCurrency(product.selling_price)}, ${product.quantity} in stock`}
      className="relative flex flex-col rounded-2xl overflow-hidden text-left w-full touch-manipulation"
      style={{
        background: isOutOfStock
          ? 'rgba(17,24,39,0.4)'
          : isInCart
            ? 'rgba(16,185,129,0.06)'
            : 'rgba(255,255,255,0.03)',
        border: isInCart
          ? '1.5px solid rgba(16,185,129,0.35)'
          : isOutOfStock
            ? '1px solid rgba(255,255,255,0.04)'
            : '1px solid rgba(255,255,255,0.07)',
        opacity: isOutOfStock ? 0.55 : 1,
        cursor: isOutOfStock ? 'not-allowed' : 'pointer',
      }}
    >
      {/* Image area */}
      <div
        className="relative w-full"
        style={{ paddingBottom: '100%' }} // 1:1 aspect ratio
      >
        <div className="absolute inset-0">
          {!imgError && product.id ? (
            <>
              {!imgLoaded && (
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ background: 'rgba(212,165,116,0.06)' }}
                >
                  <Package size={28} style={{ color: '#D4A574', opacity: 0.4 }} />
                </div>
              )}
              <img
                src={`/api/products/${product.id}/image`}
                alt={product.name}
                loading="lazy"
                className="w-full h-full object-cover"
                style={{ opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.2s' }}
                onLoad={() => setImgLoaded(true)}
                onError={() => setImgError(true)}
              />
            </>
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{
                background: isInCart
                  ? 'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(16,185,129,0.06) 100%)'
                  : 'linear-gradient(135deg, rgba(212,165,116,0.1) 0%, rgba(139,105,20,0.06) 100%)',
              }}
            >
              <Package
                size={32}
                style={{ color: isInCart ? '#10b981' : '#D4A574', opacity: 0.6 }}
              />
            </div>
          )}

          {/* Out of stock overlay */}
          {isOutOfStock && (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.45)' }}
            >
              <span
                className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
                style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}
              >
                {t('outOfStock')}
              </span>
            </div>
          )}

          {/* Status badges */}
          {isLowStock && !isOutOfStock && (
            <div className="absolute top-2 left-2">
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}
              >
                {t('low')}
              </span>
            </div>
          )}

          {/* In cart check */}
          {isInCart && !isOutOfStock && (
            <div className="absolute top-2 right-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(16,185,129,0.9)' }}
              >
                <Check size={13} className="text-white" strokeWidth={3} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-0.5">
        <p
          className="text-sm font-semibold text-white leading-tight"
          style={{
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 1,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {product.name}
        </p>
        <p className="text-sm font-bold" style={{ color: '#D4A574' }}>
          {formatCurrency(product.selling_price)}
        </p>
        <p className="text-[11px]" style={{ color: '#4a5568' }}>
          {product.quantity ?? 0} {product.unit || 'pcs'}
        </p>
      </div>
    </motion.button>
  );
}
