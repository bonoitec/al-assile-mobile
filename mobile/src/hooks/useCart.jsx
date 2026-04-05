import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const CartContext = createContext(null);

const STORAGE_KEY = 'mobile_cart';

function loadCart() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { items: new Map(), client: null };
    const parsed = JSON.parse(raw);
    return {
      items: new Map(parsed.items || []),
      client: parsed.client || null,
    };
  } catch {
    return { items: new Map(), client: null };
  }
}

function saveCart(items, client) {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ items: Array.from(items.entries()), client })
    );
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => loadCart().items);
  const [client, setClientState] = useState(() => loadCart().client);

  // Persist whenever items or client change
  useEffect(() => {
    saveCart(items, client);
  }, [items, client]);

  const addItem = useCallback((product, quantity = 1) => {
    setItems(prev => {
      const next = new Map(prev);
      const existing = next.get(product.id);
      if (existing) {
        const newQty = Math.min(existing.quantity + quantity, product.quantity ?? Infinity);
        next.set(product.id, { ...existing, quantity: newQty });
      } else {
        next.set(product.id, { product, quantity: Math.min(quantity, product.quantity ?? Infinity) });
      }
      return next;
    });

    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate(30);
  }, []);

  const removeItem = useCallback((productId) => {
    setItems(prev => {
      const next = new Map(prev);
      next.delete(productId);
      return next;
    });
  }, []);

  const updateQuantity = useCallback((productId, quantity) => {
    if (quantity <= 0) {
      setItems(prev => {
        const next = new Map(prev);
        next.delete(productId);
        return next;
      });
      return;
    }
    setItems(prev => {
      const next = new Map(prev);
      const existing = next.get(productId);
      if (!existing) return prev;
      const maxQty = existing.product.quantity ?? Infinity;
      next.set(productId, { ...existing, quantity: Math.min(quantity, maxQty) });
      return next;
    });
  }, []);

  const setClient = useCallback((clientData) => {
    setClientState(clientData);
  }, []);

  const clear = useCallback(() => {
    setItems(new Map());
    setClientState(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  const getTotal = useCallback(() => {
    let total = 0;
    for (const { product, quantity } of items.values()) {
      total += (product.selling_price || 0) * quantity;
    }
    return total;
  }, [items]);

  const getItemCount = useCallback(() => {
    let count = 0;
    for (const { quantity } of items.values()) {
      count += quantity;
    }
    return count;
  }, [items]);

  const getItemsArray = useCallback(() => {
    return Array.from(items.values());
  }, [items]);

  const isInCart = useCallback((productId) => items.has(productId), [items]);

  return (
    <CartContext.Provider value={{
      items,
      client,
      addItem,
      removeItem,
      updateQuantity,
      setClient,
      clear,
      getTotal,
      getItemCount,
      getItemsArray,
      isInCart,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
