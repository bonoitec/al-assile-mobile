import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Grid3X3, ShoppingCart, Receipt } from 'lucide-react';
import { useCart } from '../hooks/useCart.jsx';
import { t } from '../utils/i18n.js';

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { getItemCount } = useCart();

  const itemCount = getItemCount();

  const tabs = [
    { path: '/', icon: Grid3X3, label: t('products') },
    { path: '/cart', icon: ShoppingCart, label: t('cart'), badge: true },
    { path: '/sales', icon: Receipt, label: t('sales') },
  ];

  return (
    <nav
      className="flex-shrink-0 flex items-stretch"
      style={{
        background: 'rgba(8,12,20,0.97)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(20px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
      aria-label="Main navigation"
    >
      {tabs.map(({ path, icon: Icon, label, badge }) => {
        const isActive = location.pathname === path;
        const count = badge ? itemCount : 0;

        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-3
                       touch-manipulation relative transition-colors"
            style={{ minHeight: '3.5rem' }}
          >
            {/* Active indicator bar */}
            {isActive && (
              <div
                className="absolute top-0 left-1/2 -translate-x-1/2 rounded-full"
                style={{
                  width: '2rem',
                  height: '2px',
                  background: 'linear-gradient(90deg, #8B6914, #D4A574)',
                }}
              />
            )}

            {/* Icon with badge */}
            <div className="relative">
              <Icon
                size={22}
                strokeWidth={isActive ? 2.2 : 1.8}
                style={{ color: isActive ? '#D4A574' : '#3d5068' }}
              />
              {count > 0 && (
                <span
                  className="absolute -top-1.5 -right-2 min-w-[16px] h-4 flex items-center
                             justify-center rounded-full text-[10px] font-bold text-white px-1"
                  style={{ background: 'linear-gradient(135deg, #8B6914, #D4A574)' }}
                  aria-label={`${count} items in cart`}
                >
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </div>

            <span
              className="text-[10px] font-medium"
              style={{ color: isActive ? '#D4A574' : '#3d5068' }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
