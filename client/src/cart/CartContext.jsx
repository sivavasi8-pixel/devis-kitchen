import { createContext, useContext, useState } from "react";

// Cart state shared between Order.jsx (owns checkout) and CustomerNav (just needs
// the count for the nav badge) — frontend-only, nothing here is persisted or synced
// to the server; a real order isn't created until checkout actually calls the API.
const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);

  const addToCart = (item) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id);
      if (existing) {
        return prev.map((c) => (c.id === item.id ? { ...c, qty: c.qty + 1 } : c));
      }
      return [...prev, { ...item, qty: 1, menuItemId: item.id }];
    });
  };

  // Custom/made-to-order entries (e.g. "Biryani — 2kg, Chicken") are their own
  // line every time — they carry a computed price and a freeform note, so two
  // custom orders for the same base item should never merge into one row.
  const addCustomItem = (entry) => setCart((prev) => [...prev, entry]);

  // Keyed by cart row id (== menuItemId for a regular item, a unique
  // "custom-..." id for a custom line) — dropping to 0 removes the row
  // outright rather than leaving a zero-qty line sitting in the cart.
  const updateQty = (id, qty) =>
    setCart((prev) => (qty <= 0 ? prev.filter((c) => c.id !== id) : prev.map((c) => (c.id === id ? { ...c, qty } : c))));

  const removeFromCart = (id) => setCart((prev) => prev.filter((c) => c.id !== id));

  const clearCart = () => setCart([]);

  const total = cart.reduce((sum, c) => sum + (c.price || 0) * c.qty, 0);
  const count = cart.reduce((n, c) => n + c.qty, 0);

  return (
    <CartContext.Provider value={{ cart, setCart, addToCart, addCustomItem, updateQty, removeFromCart, clearCart, total, count }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside a CartProvider");
  return ctx;
}
