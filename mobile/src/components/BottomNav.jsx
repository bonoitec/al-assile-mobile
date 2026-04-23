import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Grid3X3, ShoppingCart, Receipt, Users, Truck, FileBarChart } from 'lucide-react';
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
    { path: '/clients', icon: Users, label: t('clients') },
    { path: '/suppliers', icon: Truck, label: t('suppliers') },
    { path: '/reports', icon: FileBarChart, label: t('reports') },
  ];

  return (
    <nav
      className="flex-shrink-0 flex items-stretch"
      style={{
        background: 'linear-gradient(to top, rgba(8,12,20,0.99), rgba(8,12,20,0.95))',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {tabs.map(({ path, icon: Icon, label, badge }) => {
        const isActive = location.pathname === path;
        const count = badge ? itemCount : 0;

        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            className="flex-1 flex flex-col items-center justify-center gap-1 touch-manipulation relative transition-all"
            style={{ minHeight: '4rem', padding: '0.5rem 0' }}
          >
            {isActive && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2"
                style={{
                  width: '3rem', height: '2px',
                  background: 'linear-gradient(90deg, transparent, #D4A574, transparent)',
                  borderRadius: '2px',
                }}
              />
            )}

            <div className="relative">
              <Icon
                size={24}
                strokeWidth={isActive ? 2.3 : 1.7}
                style={{ color: isActive ? '#D4A574' : '#3d5068', transition: 'color 0.15s' }}
              />
              {count > 0 && (
                <span
                  className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold text-white px-1"
                  style={{
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                    boxShadow: '0 2px 6px rgba(239,68,68,0.4)',
                  }}
                >
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </div>

            <span
              className="text-[11px] font-semibold"
              style={{ color: isActive ? '#D4A574' : '#3d5068', transition: 'color 0.15s' }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
