import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Package, Check, ShoppingCart } from 'lucide-react';
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

  return (
    <motion.button
      whileTap={isOutOfStock ? {} : { scale: 0.96 }}
      onClick={() => !isOutOfStock && onAdd(product)}
      disabled={isOutOfStock}
      className="relative flex flex-col rounded-2xl overflow-hidden text-left w-full touch-manipulation"
      style={{
        background: isInCart
          ? 'rgba(16,185,129,0.06)'
          : 'rgba(255,255,255,0.025)',
        border: isInCart
          ? '1.5px solid rgba(16,185,129,0.3)'
          : '1px solid rgba(255,255,255,0.06)',
        opacity: isOutOfStock ? 0.5 : 1,
        boxShadow: isOutOfStock ? 'none' : '0 2px 12px rgba(0,0,0,0.2)',
      }}
    >
      {/* Image — 3:2 ratio */}
      <div className="relative w-full" style={{ paddingBottom: '66%' }}>
        <div className="absolute inset-0">
          {!imgError && product.id ? (
            <>
              {!imgLoaded && (
                <div className="absolute inset-0 flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, rgba(212,165,116,0.08) 0%, rgba(139,105,20,0.04) 100%)' }}>
                  <Package size={24} style={{ color: '#D4A574', opacity: 0.3 }} />
                </div>
              )}
              <img
                src={`/api/products/${product.id}/image`}
                alt={product.name}
                loading="lazy"
                className="w-full h-full object-cover"
                style={{ opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.3s' }}
                onLoad={() => setImgLoaded(true)}
                onError={() => setImgError(true)}
              />
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center"
              style={{
                background: isInCart
                  ? 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(16,185,129,0.04) 100%)'
                  : 'linear-gradient(135deg, rgba(212,165,116,0.08) 0%, rgba(139,105,20,0.04) 100%)',
              }}>
              <Package size={28} style={{ color: isInCart ? '#10b981' : '#D4A574', opacity: 0.4 }} />
            </div>
          )}

          {/* Out of stock overlay */}
          {isOutOfStock && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
              <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
                style={{ background: 'rgba(239,68,68,0.25)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
                {t('outOfStock')}
              </span>
            </div>
          )}

          {/* Low stock badge */}
          {isLowStock && !isOutOfStock && (
            <div className="absolute top-2 left-2">
              <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase"
                style={{ background: 'rgba(245,158,11,0.25)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)' }}>
                {t('low')}
              </span>
            </div>
          )}

          {/* In cart indicator */}
          {isInCart && !isOutOfStock && (
            <div className="absolute top-2 right-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: '#10b981', boxShadow: '0 2px 8px rgba(16,185,129,0.4)' }}>
                <Check size={12} className="text-white" strokeWidth={3} />
              </div>
            </div>
          )}

          {/* Quick add badge — bottom right */}
          {!isOutOfStock && !isInCart && (
            <div className="absolute bottom-2 right-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(212,165,116,0.85)', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                <ShoppingCart size={13} className="text-white" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Product info */}
      <div className="px-3 py-2.5 flex flex-col gap-1">
        <p className="text-[13px] font-semibold text-white leading-tight"
          style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {product.name}
        </p>
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold" style={{ color: '#D4A574' }}>
            {formatCurrency(product.selling_price)}
          </p>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md"
            style={{
              background: isOutOfStock ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.04)',
              color: isOutOfStock ? '#f87171' : '#4a5568',
            }}>
            {product.quantity ?? 0} {product.unit || 'pcs'}
          </span>
        </div>
      </div>
    </motion.button>
  );
}
