import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import { useCart } from "../cart/CartContext";

// Known categories get a curated label/icon; anything else still shows up as
// a tab automatically with a generic icon — mirrors the bakery's derive-from-
// real-data approach, adapted to a restaurant menu's category set.
const CATEGORY_META = {
  mains: { label: "Mains", icon: "🍛", tone: "ph-mains" },
  breads: { label: "Breads", icon: "🍞", tone: "ph-bread" },
  starters: { label: "Starters", icon: "🥟", tone: "ph-starters" },
  desserts: { label: "Desserts", icon: "🍮", tone: "ph-desserts" },
  beverages: { label: "Beverages", icon: "🍵", tone: "ph-beverages" },
  custom: { label: "Custom order", icon: "✏️", tone: "ph-custom" }
};
const FALLBACK_CATEGORY_META = { icon: "🍽️", tone: "ph-fallback" };
const BASE_CATEGORY_ORDER = ["mains", "breads", "starters", "desserts", "beverages", "custom"];

const paymentOptions = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "card", label: "Card" }
];

const FAVORITES_KEY = "devis_kitchen_favorites";
const loadFavorites = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]"));
  } catch {
    return new Set();
  }
};

const ACTIVE_STATUSES = ["placed", "preparing", "ready", "out_for_delivery"];

// Made-to-order, weight-priced item (e.g. "Biryani by the kg") — the food-menu
// equivalent of the bakery's custom cake form. item.price is the per-kg rate.
function CustomOrderForm({ item, onAdd }) {
  const [weight, setWeight] = useState("1");
  const [protein, setProtein] = useState("");
  const [spiceLevel, setSpiceLevel] = useState("medium");
  const [neededBy, setNeededBy] = useState("");

  const price = Math.round((item.price || 0) * (Number(weight) || 0));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!weight || Number(weight) <= 0) return;
    onAdd({ weight: Number(weight), protein, spiceLevel, neededBy, price });
    setWeight("1");
    setProtein("");
    setSpiceLevel("medium");
    setNeededBy("");
  };

  return (
    <form onSubmit={handleSubmit} className="custom-cake-form">
      <p className="custom-cake-title">{item.name}</p>
      <p className="custom-cake-rate">₹{item.price}/kg — made fresh to order.</p>

      <label className="field-label">Quantity (kg)</label>
      <input type="number" min="0.5" step="0.5" value={weight} onChange={(e) => setWeight(e.target.value)} className="field-input" required />

      <label className="field-label">Protein / style (optional)</label>
      <input
        type="text"
        placeholder="e.g. Chicken, Mutton, Veg"
        value={protein}
        onChange={(e) => setProtein(e.target.value)}
        className="field-input"
      />

      <label className="field-label">Spice level</label>
      <select value={spiceLevel} onChange={(e) => setSpiceLevel(e.target.value)} className="field-input">
        <option value="mild">Mild</option>
        <option value="medium">Medium</option>
        <option value="hot">Hot</option>
      </select>

      <label className="field-label">Needed by</label>
      <input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} className="field-input" />

      <div className="custom-cake-footer">
        <span className="custom-cake-price">₹{price || 0}</span>
        <button type="submit" className="btn-add-cake">Add to order</button>
      </div>
    </form>
  );
}

const AUTO_ROTATE_MS = 3200;
const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function ProductCard({ item, isFav, onToggleFav, onAdd }) {
  const photos = item.imageUrl ? [item.imageUrl, ...(item.galleryImages || [])] : item.galleryImages || [];
  const [photoIndex, setPhotoIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const hasGallery = photos.length > 1;
  const stepPhoto = (dir) => setPhotoIndex((i) => (i + dir + photos.length) % photos.length);

  const manualStep = (dir) => {
    stepPhoto(dir);
    setPaused(true);
    setTimeout(() => setPaused(false), AUTO_ROTATE_MS * 2);
  };

  useEffect(() => {
    if (!hasGallery || paused || prefersReducedMotion) return;
    const id = setInterval(() => stepPhoto(1), AUTO_ROTATE_MS);
    return () => clearInterval(id);
  }, [hasGallery, paused, photos.length]);

  return (
    <div
      className={`product-card${!item.inStock ? " product-card-out" : ""}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="product-photo-wrap">
        {photos.length > 0 ? (
          <img src={photos[photoIndex]} alt={item.name} className="product-photo" />
        ) : (
          <div className="product-photo product-photo-empty">🍽️</div>
        )}
        {item.isPopular && <span className="badge-pop">🔥 Popular</span>}
        <button
          className={`fav-btn${isFav ? " on" : ""}`}
          onClick={() => onToggleFav(item.id)}
          aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={isFav}
        >
          ♥
        </button>
        {hasGallery && (
          <>
            <button className="gallery-nav left" onClick={() => manualStep(-1)} aria-label="Previous photo" />
            <button className="gallery-nav right" onClick={() => manualStep(1)} aria-label="Next photo" />
            <div className="gallery-dots">
              {photos.map((_, i) => <span key={i} className={i === photoIndex ? "on" : ""} />)}
            </div>
          </>
        )}
      </div>
      <div className="product-body">
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className={`veg-dot ${item.isVeg ? "veg" : "nonveg"}`} />
          <p className="product-name" style={{ margin: 0 }}>{item.name}</p>
        </div>
        <p className="product-desc">{item.description}</p>
        <div className="product-footer">
          <span className="product-price">{item.price ? `₹${item.price}` : "made to order"}</span>
          {!item.inStock ? (
            <span className="sold-out">Sold out</span>
          ) : (
            item.price && (
              <button onClick={() => onAdd(item)} className="btn-add">Add</button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

export default function Order() {
  const [menu, setMenu] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState(null);
  const [channel, setChannel] = useState("delivery");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [placing, setPlacing] = useState(false);
  const [placedOrder, setPlacedOrder] = useState(null);
  const [checkoutError, setCheckoutError] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [favorites, setFavorites] = useState(loadFavorites);
  const { user } = useAuth();
  const { cart, addToCart, addCustomItem, clearCart, total, count: cartCount } = useCart();
  const canOrder = user && user.role === "customer";
  const cartRef = useRef(null);

  useEffect(() => {
    api.getMenu().then((d) => setMenu(d.items)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!canOrder) {
      setActiveOrder(null);
      return;
    }
    api
      .getMyOrders()
      .then((d) => setActiveOrder(d.orders.find((o) => ACTIVE_STATUSES.includes(o.status)) || null))
      .catch(() => {});
  }, [canOrder]);

  const categories = useMemo(() => {
    if (!menu) return [];
    const present = new Set(menu.map((m) => m.category));
    present.delete("special");
    const ordered = BASE_CATEGORY_ORDER.filter((c) => present.has(c));
    present.forEach((c) => { if (!ordered.includes(c)) ordered.push(c); });
    return ordered.map((id) => {
      const meta = CATEGORY_META[id] || FALLBACK_CATEGORY_META;
      return { id, label: meta.label || id.charAt(0).toUpperCase() + id.slice(1), icon: meta.icon, tone: meta.tone };
    });
  }, [menu]);

  useEffect(() => {
    if (activeCategory === null && categories.length > 0) setActiveCategory(categories[0].id);
  }, [categories, activeCategory]);

  const toggleFavorite = (id) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const addCustomOrder = (customItemId) => ({ weight, protein, spiceLevel, neededBy, price }) => {
    const note = [protein || null, `${spiceLevel} spice`, neededBy ? `Needed by ${neededBy}` : null].filter(Boolean).join(" — ");
    addCustomItem({
      id: `custom-${Date.now()}`,
      menuItemId: customItemId,
      name: `Biryani by the kg — ${weight}kg${protein ? `, ${protein}` : ""}`,
      price,
      qty: 1,
      note
    });
  };

  const handleCheckout = async () => {
    setCheckoutError(null);
    if (channel === "delivery" && !deliveryAddress.trim()) {
      setCheckoutError("Please enter a delivery address");
      return;
    }
    setPlacing(true);
    try {
      const order = await api.createOrder({
        items: cart.map((c) => ({ menuItemId: c.menuItemId, name: c.name, qty: c.qty, price: c.price, note: c.note })),
        total,
        channel,
        paymentMethod,
        deliveryAddress: channel === "delivery" ? deliveryAddress : undefined,
        deliveryPhone: channel === "delivery" ? deliveryPhone : undefined,
        tableNumber: channel === "dine_in" ? tableNumber : undefined
      });
      setPlacedOrder(order.order);
      setActiveOrder(order.order);
      clearCart();
      setDeliveryAddress("");
      setDeliveryPhone("");
      setTableNumber("");
    } catch (err) {
      setCheckoutError(err.message);
    } finally {
      setPlacing(false);
    }
  };

  const scrollToCart = () => cartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  if (error) return <p style={{ padding: 28, color: "var(--red)" }}>Couldn't load menu: {error}</p>;
  if (!menu) return <p style={{ padding: 28, color: "var(--text-secondary)" }}>Loading menu…</p>;

  const q = search.trim().toLowerCase();
  const searchable = menu.filter((m) => m.category !== "custom" && m.category !== "special");
  const shown = q ? searchable.filter((m) => m.name.toLowerCase().includes(q)) : menu.filter((m) => m.category === activeCategory);
  const customItem = menu.find((m) => m.category === "custom");
  const specials = menu.filter((m) => m.isSpecial);

  const selectCategory = (id) => {
    setSearch("");
    setActiveCategory(id);
  };

  return (
    <div className="page order-page">
      <div className="hero">
        <div className="hero-copy">
          <span className="hero-eyebrow">✨ Fresh today</span>
          <h1 className="hero-title">Home-style, made to order</h1>
          <p className="hero-sub">Delivery · Pickup · Dine-in</p>
        </div>
      </div>

      {activeOrder && (
        <Link to={`/receipt/${activeOrder.id}`} className="tracker">
          <span className="tracker-dot" />
          <span className="tracker-body">
            <span className="tracker-title">Order #{activeOrder.id} · {activeOrder.status.replace(/_/g, " ")}</span>
            <span className="tracker-meta">
              {activeOrder.items.length} item{activeOrder.items.length === 1 ? "" : "s"} · {activeOrder.channel.replace("_", "-")}
            </span>
          </span>
          <span className="tracker-chevron">›</span>
        </Link>
      )}

      <div className="search-wrap">
        <span className="search-icon">🔍</span>
        <input
          className="search-input"
          type="text"
          placeholder="Search the menu…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {specials.length > 0 && !q && (
        <div className="specials-section">
          <div className="specials-heading">
            <h2>✨ Today's Specials</h2>
            <span>Fresh picks, today only</span>
          </div>
          <div className="specials-grid">
            {specials.map((item) => {
              // Same cover-photo resolution as ProductCard: prefer the dedicated
              // cover image, but fall back to the first gallery photo — a special
              // with only gallery photos (no imageUrl) shouldn't show blank.
              const coverPhoto = item.imageUrl || item.galleryImages?.[0];
              return (
              <div key={item.id} className="special-card">
                <span className="special-ribbon">Today only</span>
                {coverPhoto ? (
                  <img src={coverPhoto} alt={item.name} className="special-photo" />
                ) : (
                  <div className="special-photo special-photo-empty" />
                )}
                <p className="special-name">{item.name}</p>
                <p className="special-desc">{item.description}</p>
                <div className="special-footer">
                  <span className="special-price">{item.price ? `₹${item.price}` : "made to order"}</span>
                  {!item.inStock ? (
                    <span className="sold-out">Sold out</span>
                  ) : (
                    item.price && (
                      <button onClick={() => addToCart(item)} className="btn-add-special">Add</button>
                    )
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="category-scroll">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => selectCategory(c.id)}
            className={`chip${!q && activeCategory === c.id ? " chip-active" : ""}`}
          >
            <span className={`chip-thumb ${c.tone}`}>{c.icon}</span>
            {c.label}
          </button>
        ))}
      </div>

      <div className="order-layout">
        {!q && activeCategory === "custom" ? (
          customItem ? (
            <CustomOrderForm item={customItem} onAdd={addCustomOrder(customItem.id)} />
          ) : (
            <p className="empty-note">Custom orders aren't available right now.</p>
          )
        ) : (
          <div className="product-grid">
            {shown.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                isFav={favorites.has(item.id)}
                onToggleFav={toggleFavorite}
                onAdd={addToCart}
              />
            ))}
            {shown.length === 0 && (
              <p className="empty-note">{q ? `Nothing matches "${search}".` : "Nothing in this category yet."}</p>
            )}
          </div>
        )}

        <aside className="cart-panel" ref={cartRef}>
          <h2 className="section-title">Your order</h2>

          {placedOrder ? (
            <div className="placed-order-card">
              <p className="placed-order-title">Order #{placedOrder.id} placed!</p>
              <p className="placed-order-meta">
                Status: {placedOrder.status.replace(/_/g, " ")} · {placedOrder.channel.replace("_", "-")} · Payment:{" "}
                {placedOrder.paymentStatus === "paid" ? "paid" : "pay on " + (channel === "delivery" ? "delivery" : "pickup")}
              </p>
              <Link to={`/receipt/${placedOrder.id}`} className="btn-checkout" style={{ display: "block", textAlign: "center", textDecoration: "none", marginBottom: "8px" }}>
                View / print receipt
              </Link>
              <button onClick={() => setPlacedOrder(null)} className="btn-secondary">
                Place another order
              </button>
            </div>
          ) : (
            <>
              <div className="cart-list">
                {cart.length === 0 && <p className="empty-note">Your cart is empty.</p>}
                {cart.map((c) => (
                  <div key={c.id} className="cart-row">
                    <div className="cart-row-main">
                      <span>{c.name}{c.qty > 1 ? ` x${c.qty}` : ""}</span>
                      <span>₹{c.price * c.qty}</span>
                    </div>
                    {c.note && <p className="cart-row-note">{c.note}</p>}
                  </div>
                ))}
              </div>

              {cart.length > 0 && (
                <>
                  <select value={channel} onChange={(e) => setChannel(e.target.value)} className="field-input">
                    <option value="delivery">Delivery</option>
                    <option value="pickup">Pickup</option>
                    <option value="dine_in">Dine-in</option>
                  </select>
                  {channel === "delivery" && (
                    <>
                      <textarea
                        placeholder="Delivery address"
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        className="field-input"
                        rows={2}
                      />
                      <input
                        type="text"
                        placeholder="Phone (optional)"
                        value={deliveryPhone}
                        onChange={(e) => setDeliveryPhone(e.target.value)}
                        className="field-input"
                      />
                    </>
                  )}
                  {channel === "dine_in" && (
                    <input
                      type="text"
                      placeholder="Table number"
                      value={tableNumber}
                      onChange={(e) => setTableNumber(e.target.value)}
                      className="field-input"
                    />
                  )}
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="field-input">
                    {paymentOptions.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </>
              )}

              <div className="cart-total-row">
                <span className="cart-total-label">Total</span>
                <span className="cart-total-value">₹{total}</span>
              </div>

              {checkoutError && <p className="checkout-error">{checkoutError}</p>}

              {canOrder ? (
                <button onClick={handleCheckout} disabled={cart.length === 0 || placing} className="btn-checkout">
                  {placing ? "Placing order…" : "Checkout"}
                </button>
              ) : (
                cart.length > 0 && (
                  <p className="login-prompt">
                    <Link to="/login" state={{ from: "/order" }}>Log in</Link>
                    {" "}or{" "}
                    <Link to="/signup">create an account</Link>
                    {" "}to check out — your cart stays right here.
                  </p>
                )
              )}
            </>
          )}
        </aside>
      </div>

      {cartCount > 0 && !placedOrder && (
        <button className="mobile-cart-bar" onClick={scrollToCart}>
          <span className="mobile-cart-count">{cartCount} item{cartCount > 1 ? "s" : ""}</span>
          <span className="mobile-cart-total">₹{total}</span>
          <span className="mobile-cart-cta">View cart</span>
        </button>
      )}

      <style>{`
        .hero {
          margin-bottom: 16px; border-radius: var(--radius-lg); overflow: hidden; position: relative;
          min-height: 132px; display: flex; align-items: center;
          background:
            radial-gradient(120% 140% at 15% 20%, rgba(201,138,46,0.5), transparent 55%),
            linear-gradient(120deg, #4a2f1a, #241811 60%, #16110c);
        }
        .hero-copy { position: relative; z-index: 1; padding: 22px 22px; color: var(--cream); }
        .hero-eyebrow {
          display: inline-flex; align-items: center; gap: 5px; font-size: 11px; text-transform: uppercase;
          letter-spacing: 0.07em; background: rgba(250,248,243,0.16); border: 1px solid rgba(250,248,243,0.3);
          padding: 3px 10px; border-radius: 999px; margin-bottom: 10px;
        }
        .hero-title { font-size: 26px; margin: 0 0 5px; line-height: 1.15; color: var(--cream); }
        .hero-sub { font-size: 12.5px; opacity: 0.85; margin: 0; }

        .tracker {
          display: flex; align-items: center; gap: 11px; margin-bottom: 16px;
          background: var(--surface-1); border: 1px solid var(--gold); border-radius: var(--radius);
          padding: 12px 14px; text-decoration: none; color: var(--text-primary);
        }
        .tracker-dot {
          width: 9px; height: 9px; border-radius: 50%; background: var(--warning-text);
          flex-shrink: 0; box-shadow: 0 0 0 4px var(--warning-bg);
        }
        .tracker-body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .tracker-title { font-size: 13px; font-weight: 600; text-transform: capitalize; }
        .tracker-meta { font-size: 11.5px; color: var(--text-secondary); margin-top: 2px; }
        .tracker-chevron { font-size: 17px; color: var(--text-muted); flex-shrink: 0; }

        .search-wrap { position: relative; margin-bottom: 20px; }
        .search-input {
          width: 100%; box-sizing: border-box; padding: 10px 14px 10px 38px;
          border-radius: 10px; border: 1px solid var(--border); background: var(--surface-1);
          font-size: 13.5px; font-family: var(--font-body); color: var(--text-primary);
        }
        .search-input::placeholder { color: var(--text-muted); }
        .search-icon { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); font-size: 13px; opacity: 0.6; }

        .specials-section { margin-bottom: 24px; }
        .specials-heading { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; }
        .specials-heading h2 { font-size: 15px; margin: 0; }
        .specials-heading span { font-size: 11.5px; color: var(--text-secondary); }
        .specials-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
        .special-card {
          position: relative; overflow: hidden; border: 1.5px solid var(--gold);
          border-radius: var(--radius-lg); padding: 12px; background: var(--surface-1);
        }
        .special-ribbon {
          position: absolute; top: 10px; right: -28px; background: var(--gold); color: var(--charcoal);
          font-size: 9.5px; font-weight: 700; letter-spacing: 0.03em; padding: 3px 30px;
          transform: rotate(35deg); text-transform: uppercase;
        }
        .special-photo { width: 100%; height: 68px; border-radius: 9px; margin-bottom: 9px; object-fit: cover; }
        .special-photo-empty { background: var(--surface-2); }
        .special-name { margin: 0; font-size: 13px; font-weight: 600; }
        .special-desc { margin: 3px 0 0; font-size: 11.5px; color: var(--text-secondary); min-height: 30px; }
        .special-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 9px; }
        .special-price { font-size: 13px; font-weight: 600; }
        .btn-add-special {
          padding: 5px 11px; font-size: 11px; border: 1px solid var(--border-strong); border-radius: 6px;
          background: var(--surface-1); color: var(--text-primary);
        }

        .category-scroll {
          display: flex; gap: 16px; overflow-x: auto; padding: 2px 2px 6px;
          margin-bottom: 20px; -webkit-overflow-scrolling: touch;
        }
        .category-scroll::-webkit-scrollbar { display: none; }
        .chip {
          flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 6px;
          border: none; background: none; width: 64px; font-size: 11.5px; color: var(--text-secondary);
          white-space: nowrap; font-weight: 500;
        }
        .chip-thumb {
          width: 56px; height: 56px; border-radius: 50%; border: 2px solid transparent;
          display: flex; align-items: center; justify-content: center; font-size: 24px;
          transition: border-color .12s ease, transform .12s ease;
        }
        .chip-active { color: var(--charcoal); font-weight: 700; }
        .chip-active .chip-thumb { border-color: var(--gold); transform: scale(1.05); }
        .chip:active .chip-thumb { transform: scale(0.94); }
        .ph-mains { background: linear-gradient(135deg,#e8b077,#b3401f); }
        .ph-bread { background: linear-gradient(135deg,#e6c68f,#c99a5c); }
        .ph-starters { background: linear-gradient(135deg,#c9955f,#8f5a2e); }
        .ph-desserts { background: linear-gradient(135deg,#d9c08f,#a97a3d); }
        .ph-beverages { background: linear-gradient(135deg,#a3c9a8,#5e8a63); }
        .ph-custom { background: linear-gradient(135deg,#e0c5e0,#b88fc9); }
        .ph-fallback { background: linear-gradient(135deg,#c9b896,#a08a5f); }

        .veg-dot { width: 9px; height: 9px; border-radius: 2px; border: 1.5px solid; display: inline-block; flex-shrink: 0; }
        .veg-dot.veg { border-color: #2c5c26; background: #2c5c26; }
        .veg-dot.nonveg { border-color: var(--red); background: var(--red); }

        .order-layout { display: block; }
        @media (min-width: 860px) {
          .order-layout { display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px; align-items: start; }
        }

        .product-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (min-width: 520px) { .product-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (min-width: 860px) { .product-grid { grid-template-columns: 1fr 1fr; } }

        .product-card {
          background: var(--surface-1); border: 1px solid var(--border);
          border-radius: var(--radius-lg); overflow: hidden;
          transition: transform .14s ease, box-shadow .14s ease, border-color .14s ease;
        }
        .product-card:hover, .product-card:focus-within {
          transform: translateY(-2px); box-shadow: 0 10px 20px -12px rgba(0,0,0,0.25); border-color: var(--border-strong);
        }
        .product-card-out { opacity: 0.6; }
        .product-photo-wrap { position: relative; }
        .product-photo { width: 100%; height: 112px; object-fit: cover; }
        .product-photo-empty {
          background: var(--surface-2); display: flex; align-items: center; justify-content: center; font-size: 26px;
        }
        .fav-btn {
          position: absolute; right: 7px; top: 7px; width: 26px; height: 26px; border-radius: 50%;
          background: rgba(255,255,255,0.85); border: none; display: flex; align-items: center; justify-content: center;
          font-size: 13px; color: var(--text-muted); transition: transform .12s ease, color .12s ease;
          z-index: 3;
        }
        .fav-btn.on { color: var(--red); }
        .fav-btn:active { transform: scale(0.85); }
        .badge-pop {
          position: absolute; left: 7px; top: 7px; z-index: 2; pointer-events: none;
          background: rgba(38,36,31,0.82); color: #fff; font-size: 10px; font-weight: 700;
          padding: 3px 8px; border-radius: 999px;
        }
        .gallery-nav {
          position: absolute; top: 24px; bottom: 0; width: 34%; background: none; border: none; padding: 0; z-index: 1;
        }
        .gallery-nav.left { left: 0; } .gallery-nav.right { right: 0; }
        .gallery-dots {
          position: absolute; left: 0; right: 0; bottom: 6px; display: flex; justify-content: center; gap: 4px;
          z-index: 2; pointer-events: none;
        }
        .gallery-dots span { width: 4px; height: 4px; border-radius: 50%; background: rgba(255,255,255,0.55); }
        .gallery-dots span.on { background: #fff; width: 11px; border-radius: 3px; }
        .product-body { padding: 9px 11px 11px; }
        .product-name { margin: 0; font-size: 13px; font-weight: 500; }
        .product-desc { margin: 3px 0 10px; font-size: 12px; color: var(--text-secondary); }
        .product-footer { display: flex; justify-content: space-between; align-items: center; }
        .product-price { font-size: 13px; font-weight: 500; }
        .sold-out { font-size: 12px; color: var(--red); }
        .btn-add {
          padding: 5px 12px; font-size: 12px; font-weight: 600; border: 1px solid var(--green);
          color: var(--green); border-radius: 999px; background: var(--surface-1);
          transition: background .12s ease, color .12s ease, transform .1s ease;
        }
        .btn-add:hover { background: var(--green); color: var(--cream); }
        .btn-add:active { transform: scale(0.94); }

        .empty-note { font-size: 13px; color: var(--text-secondary); padding: 8px 0; }

        .cart-panel {
          display: block; background: var(--surface-1); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 16px; margin-top: 20px; scroll-margin-top: 20px;
        }
        @media (min-width: 860px) {
          .cart-panel { margin-top: 0; position: sticky; top: 20px; }
        }
        .section-title { font-size: 16px; margin-bottom: 10px; }

        .cart-list { border: 1px solid var(--border); border-radius: var(--radius); padding: 4px 14px; margin-bottom: 14px; }
        .cart-row { padding: 9px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
        .cart-row:last-child { border-bottom: none; }
        .cart-row-main { display: flex; justify-content: space-between; }
        .cart-row-note { margin: 3px 0 0; font-size: 11px; color: var(--text-secondary); }

        .field-input {
          width: 100%; padding: 8px 10px; font-size: 13px; border: 1px solid var(--border);
          border-radius: 8px; margin-bottom: 10px; box-sizing: border-box; font-family: var(--font-body);
          resize: vertical;
        }
        .field-label { font-size: 11px; color: var(--text-secondary); }

        .cart-total-row { display: flex; justify-content: space-between; margin: 12px 0; }
        .cart-total-label { font-size: 13px; color: var(--text-secondary); }
        .cart-total-value { font-size: 16px; font-weight: 500; }

        .checkout-error { font-size: 12px; color: var(--red); margin-bottom: 10px; }

        .btn-checkout {
          width: 100%; padding: 10px; font-size: 13px; border: none; border-radius: 8px;
          background: var(--green); color: var(--cream); font-weight: 500; box-sizing: border-box;
        }
        .btn-checkout:disabled { background: var(--surface-2); color: var(--text-muted); }
        .btn-secondary {
          width: 100%; padding: 9px; font-size: 13px; background: var(--surface-2);
          border: 1px solid var(--border-strong); border-radius: 8px;
        }

        .login-prompt { font-size: 12px; color: var(--text-secondary); }
        .login-prompt a { color: var(--green); }

        .placed-order-card { border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; }
        .placed-order-title { margin: 0 0 6px; font-size: 13px; font-weight: 500; }
        .placed-order-meta { margin: 0 0 12px; font-size: 12px; color: var(--text-secondary); text-transform: capitalize; }

        .custom-cake-form { border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px; background: var(--surface-1); }
        .custom-cake-title { margin: 0 0 4px; font-size: 13px; font-weight: 500; }
        .custom-cake-rate { margin: 0 0 14px; font-size: 12px; color: var(--text-secondary); }
        .custom-cake-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; }
        .custom-cake-price { font-size: 13px; font-weight: 500; }
        .btn-add-cake { padding: 8px 16px; font-size: 13px; background: var(--green); color: var(--cream); border: none; border-radius: 8px; }

        .mobile-cart-bar {
          position: fixed; bottom: calc(var(--tabbar-h) + 12px); left: 16px; right: 16px;
          background: var(--green); color: var(--cream); border: none;
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          padding: 12px 16px; border-radius: var(--radius); z-index: 19;
          box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        }
        .mobile-cart-count { font-size: 12px; opacity: 0.85; }
        .mobile-cart-total { font-size: 14px; font-weight: 600; }
        .mobile-cart-cta { font-size: 12px; text-decoration: underline; }
        @media (min-width: 860px) {
          .mobile-cart-bar { display: none; }
        }
      `}</style>
    </div>
  );
}
