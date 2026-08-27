import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { AdminPage, ListPanel } from "../components/admin/AdminUI";

// The known baseline categories, kept in a fixed display order so tabs don't
// jump around as items are added/removed. Anything else (including brand-new
// categories the owner creates on the fly) is free-text and just appended.
const BASE_CATEGORIES = ["mains", "breads", "starters", "desserts", "beverages", "custom"];
const specialCategory = { value: "special", label: "⭐ Today's special (not on regular menu)" };
const NEW_CATEGORY_VALUE = "__new__";

const emptyForm = { name: "", category: "mains", price: "", unit: "", description: "" };
const MAX_GALLERY_IMAGES = 4;

function RecipeEditor({ item, inventory, onClose }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getRecipe(item.id)
      .then((d) => setRows(d.ingredients.map((r) => ({ inventoryId: r.inventoryId, qtyPerUnit: r.qtyPerUnit }))))
      .catch((e) => setError(e.message));
  }, [item.id]);

  const updateRow = (i, field, value) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  const removeRow = (i) => setRows((prev) => prev.filter((_, idx) => idx !== i));
  const addRow = () => {
    const first = inventory[0];
    if (!first) return;
    setRows((prev) => [...prev, { inventoryId: first.id, qtyPerUnit: "" }]);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const ingredients = rows
        .filter((r) => r.inventoryId && r.qtyPerUnit !== "" && Number(r.qtyPerUnit) > 0)
        .map((r) => ({ inventoryId: Number(r.inventoryId), qtyPerUnit: Number(r.qtyPerUnit) }));
      await api.updateRecipe(item.id, ingredients);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-recipe-editor">
      <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 500 }}>
        Recipe for {item.name} — how much of each ingredient one {item.unit} uses
      </p>
      {rows === null ? (
        <p style={{ fontSize: 12, color: "var(--a-text-secondary)" }}>Loading…</p>
      ) : (
        <>
          {rows.map((row, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <select value={row.inventoryId} onChange={(e) => updateRow(i, "inventoryId", e.target.value)} className="admin-inline-input" style={{ flex: 2 }}>
                {inventory.map((inv) => <option key={inv.id} value={inv.id}>{inv.name} ({inv.unit})</option>)}
              </select>
              <input
                type="number" step="0.001" placeholder="Qty per unit" value={row.qtyPerUnit}
                onChange={(e) => updateRow(i, "qtyPerUnit", e.target.value)}
                className="admin-inline-input" style={{ width: 100 }}
              />
              <button onClick={() => removeRow(i)} className="admin-link-btn danger">✕</button>
            </div>
          ))}
          <button onClick={addRow} type="button" className="admin-btn-xs" style={{ marginBottom: 10 }}>+ Add ingredient</button>
          {error && <p style={{ fontSize: 12, color: "var(--a-danger-text)", marginBottom: 8 }}>{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleSave} disabled={saving} className="admin-btn-primary" style={{ width: "auto", padding: "6px 14px" }}>
              {saving ? "Saving…" : "Save recipe"}
            </button>
            <button onClick={onClose} type="button" className="admin-btn-secondary" style={{ padding: "6px 14px" }}>Close</button>
          </div>
        </>
      )}
    </div>
  );
}

function PhotosEditor({ item, maxImages, onChanged, onClose }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      await api.addMenuGalleryImage(item.id, fd);
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (imageUrl) => {
    const imageId = imageUrl.split("/").pop();
    setError(null);
    try {
      await api.deleteMenuGalleryImage(item.id, imageId);
      await onChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  const atLimit = item.galleryImages.length >= maxImages;

  return (
    <div className="admin-recipe-editor">
      <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 500 }}>
        Extra photos for {item.name} — shown as a swipeable gallery alongside the cover photo ({item.galleryImages.length}/{maxImages})
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {item.galleryImages.map((url) => (
          <div key={url} style={{ position: "relative" }}>
            <img src={url} alt="" style={{ width: 64, height: 64, borderRadius: 8, objectFit: "cover", display: "block" }} />
            <button
              onClick={() => handleDelete(url)}
              className="admin-photo-remove"
              aria-label="Remove photo"
            >
              ✕
            </button>
          </div>
        ))}
        {!atLimit && (
          <label className="admin-photo-add">
            {uploading ? "…" : "+ Add"}
            <input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} style={{ display: "none" }} />
          </label>
        )}
      </div>
      {atLimit && <p style={{ fontSize: 11, color: "var(--a-text-secondary)", marginBottom: 8 }}>Maximum reached — remove one to add another.</p>}
      {error && <p style={{ fontSize: 12, color: "var(--a-danger-text)", marginBottom: 8 }}>{error}</p>}
      <button onClick={onClose} type="button" className="admin-btn-secondary" style={{ padding: "6px 14px" }}>Close</button>
    </div>
  );
}

function StatusPills({ item }) {
  return (
    <>
      {item.isSpecial && <span className="status-pill gold">⭐ Special</span>}
      {item.isPopular && <span className="status-pill red">🔥 Popular</span>}
      {!item.inStock && <span className="status-pill muted">Sold out</span>}
    </>
  );
}

function MenuItemActions({ item, isRecipeOpen, isGalleryOpen, onToggleSpecial, onTogglePopular, onToggleAvailability, onToggleRecipe, onToggleGallery, onEdit, onDelete }) {
  return (
    <div className="menu-row-actions">
      <div className="action-group">
        <button onClick={onToggleSpecial} className={`toggle-chip${item.isSpecial ? " on gold" : ""}`}>⭐ Special</button>
        <button onClick={onTogglePopular} className={`toggle-chip${item.isPopular ? " on red" : ""}`}>🔥 Popular</button>
        <button onClick={onToggleAvailability} className={`toggle-chip${!item.inStock ? " on red" : ""}`}>
          {item.inStock ? "In stock" : "Sold out"}
        </button>
      </div>
      <div className="action-divider" />
      <div className="action-group">
        <button onClick={onToggleRecipe} className={`admin-btn-xs${isRecipeOpen ? " active" : ""}`}>Recipe</button>
        <button onClick={onToggleGallery} className={`admin-btn-xs${isGalleryOpen ? " active" : ""}`}>Photos</button>
      </div>
      <div className="action-divider" />
      <div className="action-group">
        <button onClick={onEdit} className="admin-btn-xs">Edit</button>
        <button onClick={onDelete} className="admin-btn-xs danger">Delete</button>
      </div>
    </div>
  );
}

function MenuListRow({ item, ...actionProps }) {
  return (
    <div className="menu-row">
      <div className="menu-row-info">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} className="menu-row-thumb" />
        ) : (
          <div className="menu-row-thumb menu-row-thumb-empty" />
        )}
        <div className="menu-row-text">
          <div className="menu-row-name-line">
            <span className="menu-row-name">{item.name}</span>
            <StatusPills item={item} />
          </div>
          <p className="menu-row-meta">
            {item.category} · {item.price ? `₹${item.price}` : "made to order"} / {item.unit}
            {item.galleryImages.length > 0 && ` · ${item.galleryImages.length} extra photo${item.galleryImages.length > 1 ? "s" : ""}`}
          </p>
        </div>
      </div>
      <MenuItemActions item={item} {...actionProps} />
    </div>
  );
}

function MenuGridCard({ item, ...actionProps }) {
  return (
    <div className="menu-grid-card">
      {item.imageUrl ? (
        <img src={item.imageUrl} alt={item.name} className="menu-grid-photo" />
      ) : (
        <div className="menu-grid-photo menu-grid-photo-empty" />
      )}
      <div className="menu-grid-card-body">
        <div className="menu-row-name-line">
          <span className="menu-row-name">{item.name}</span>
        </div>
        <div className="menu-grid-card-tags"><StatusPills item={item} /></div>
        <p className="menu-row-meta">
          {item.price ? `₹${item.price} / ${item.unit}` : `made to order / ${item.unit}`}
        </p>
        <MenuItemActions item={item} {...actionProps} />
      </div>
    </div>
  );
}

export default function AdminMenu() {
  const [items, setItems] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [recipeItemId, setRecipeItemId] = useState(null);
  const [galleryItemId, setGalleryItemId] = useState(null);

  const [view, setView] = useState("list");
  const [activeCategory, setActiveCategory] = useState(null);
  const [pendingNewCategories, setPendingNewCategories] = useState([]);
  const [showNewCategoryModal, setShowNewCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const load = () => api.getMenu().then((d) => setItems(d.items)).catch((e) => setError(e.message));

  useEffect(() => {
    load();
    api.getInventory().then((d) => setInventory(d.items)).catch((e) => setError(e.message));
  }, []);

  const categoryList = useMemo(() => {
    if (!items) return [];
    const present = new Set(items.map((i) => i.category));
    const ordered = BASE_CATEGORIES.filter((c) => present.has(c));
    present.forEach((c) => {
      if (!ordered.includes(c) && c !== specialCategory.value) ordered.push(c);
    });
    if (present.has(specialCategory.value)) ordered.push(specialCategory.value);
    pendingNewCategories.forEach((c) => { if (!ordered.includes(c)) ordered.push(c); });
    return ordered;
  }, [items, pendingNewCategories]);

  useEffect(() => {
    if (activeCategory === null && categoryList.length > 0) setActiveCategory(categoryList[0]);
  }, [categoryList, activeCategory]);

  const itemsInActiveCategory = useMemo(
    () => (items || []).filter((m) => m.category === activeCategory),
    [items, activeCategory]
  );

  const formCategoryOptions = useMemo(() => {
    const set = new Set([...BASE_CATEGORIES, ...pendingNewCategories, ...(items || []).map((i) => i.category)]);
    set.delete(specialCategory.value);
    return [...set];
  }, [items, pendingNewCategories]);

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({ name: item.name, category: item.category, price: item.price ?? "", unit: item.unit, description: item.description || "" });
    setImageFile(null);
    setFormError(null);
  };

  const resetForm = () => {
    setEditingId(null);
    setForm((f) => ({ ...emptyForm, category: f.category }));
    setImageFile(null);
    setFormError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("name", form.name);
      fd.append("category", form.category);
      fd.append("price", form.price);
      fd.append("unit", form.unit);
      fd.append("description", form.description);
      if (imageFile) fd.append("image", imageFile);

      if (editingId) {
        await api.updateMenuItem(editingId, fd);
      } else {
        await api.createMenuItem(fd);
      }
      setActiveCategory(form.category);
      resetForm();
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this item?")) return;
    try {
      await api.deleteMenuItem(id);
      if (editingId === id) resetForm();
      if (recipeItemId === id) setRecipeItemId(null);
      if (galleryItemId === id) setGalleryItemId(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleAvailability = async (item) => {
    try {
      await api.updateMenuAvailability(item.id, !item.inStock);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleSpecial = async (item) => {
    try {
      await api.updateMenuSpecial(item.id, !item.isSpecial);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const togglePopular = async (item) => {
    try {
      await api.updateMenuPopular(item.id, !item.isPopular);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCategorySelectChange = (e) => {
    if (e.target.value === NEW_CATEGORY_VALUE) {
      setShowNewCategoryModal(true);
      return;
    }
    setForm((f) => ({ ...f, category: e.target.value }));
  };

  const confirmNewCategory = () => {
    const name = newCategoryName.trim().toLowerCase();
    if (!name) return;
    setPendingNewCategories((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setForm((f) => ({ ...f, category: name }));
    setActiveCategory(name);
    setShowNewCategoryModal(false);
    setNewCategoryName("");
  };

  const cancelNewCategory = () => {
    setShowNewCategoryModal(false);
    setNewCategoryName("");
  };

  if (error) return <AdminPage title="Menu"><p style={{ color: "var(--a-danger-text)" }}>Couldn't load menu: {error}</p></AdminPage>;
  if (!items || !inventory) return <AdminPage title="Menu"><p style={{ color: "var(--a-text-secondary)" }}>Loading…</p></AdminPage>;

  const actionPropsFor = (item) => ({
    isRecipeOpen: recipeItemId === item.id,
    isGalleryOpen: galleryItemId === item.id,
    onToggleSpecial: () => toggleSpecial(item),
    onTogglePopular: () => togglePopular(item),
    onToggleAvailability: () => toggleAvailability(item),
    onToggleRecipe: () => setRecipeItemId(recipeItemId === item.id ? null : item.id),
    onToggleGallery: () => setGalleryItemId(galleryItemId === item.id ? null : item.id),
    onEdit: () => startEdit(item),
    onDelete: () => handleDelete(item.id)
  });

  return (
    <AdminPage eyebrow="Add, edit, and photograph what's for sale — this is what customers see on the Order page" title="Menu">
      <div className="menu-toolbar">
        <div className="menu-cat-tabs">
          {categoryList.map((c) => (
            <button
              key={c}
              className={`menu-cat-tab${c === activeCategory ? " active" : ""}`}
              onClick={() => setActiveCategory(c)}
            >
              {c === specialCategory.value ? "⭐ Special" : c} · {items.filter((m) => m.category === c).length}
            </button>
          ))}
        </div>
        <div className="menu-view-toggle">
          <button
            className={`menu-view-btn${view === "list" ? " active" : ""}`}
            onClick={() => setView("list")}
            aria-label="List view"
          >
            <i className="ti ti-list" aria-hidden="true" />
          </button>
          <button
            className={`menu-view-btn${view === "card" ? " active" : ""}`}
            onClick={() => setView("card")}
            aria-label="Card view"
          >
            <i className="ti ti-layout-grid" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="admin-two-col">
        <div>
          {itemsInActiveCategory.length === 0 && (
            <div className="menu-empty">No items in {activeCategory} yet — add one on the right.</div>
          )}

          {itemsInActiveCategory.length > 0 && view === "list" && (
            <ListPanel>
              {itemsInActiveCategory.map((item) => (
                <div key={item.id} className="menu-row-wrap">
                  <MenuListRow item={item} {...actionPropsFor(item)} />
                  {recipeItemId === item.id && <RecipeEditor item={item} inventory={inventory} onClose={() => setRecipeItemId(null)} />}
                  {galleryItemId === item.id && (
                    <PhotosEditor item={item} maxImages={MAX_GALLERY_IMAGES} onChanged={load} onClose={() => setGalleryItemId(null)} />
                  )}
                </div>
              ))}
            </ListPanel>
          )}

          {itemsInActiveCategory.length > 0 && view === "card" && (
            <div className="menu-card-grid">
              {itemsInActiveCategory.map((item) => (
                <div key={item.id} className="menu-grid-card-wrap">
                  <MenuGridCard item={item} {...actionPropsFor(item)} />
                  {recipeItemId === item.id && <RecipeEditor item={item} inventory={inventory} onClose={() => setRecipeItemId(null)} />}
                  {galleryItemId === item.id && (
                    <PhotosEditor item={item} maxImages={MAX_GALLERY_IMAGES} onChanged={load} onClose={() => setGalleryItemId(null)} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="admin-form-panel">
          <p className="admin-section-title">{editingId ? "Edit item" : "Add item"}</p>
          <input className="admin-search" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ marginBottom: 8 }} required />
          <select className="admin-search" value={form.category} onChange={handleCategorySelectChange} style={{ marginBottom: 8 }}>
            {formCategoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value={specialCategory.value}>{specialCategory.label}</option>
            <option value={NEW_CATEGORY_VALUE}>+ New category…</option>
          </select>
          {form.category === specialCategory.value && (
            <p className="admin-note">
              This item won't appear in Mains/Breads/Starters/Desserts — only in "Today's Specials" on the Order page, and only until end of day.
            </p>
          )}
          {form.category === "custom" && (
            <p className="admin-note">
              Made-to-order, weight-based item (e.g. "Biryani by the kg") — set Price to the per-kg rate. Customers order these from a dedicated form, not the regular menu grid.
            </p>
          )}
          <input type="number" step="0.01" className="admin-search" placeholder="Price (leave blank for made-to-order)" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} style={{ marginBottom: 8 }} />
          <input className="admin-search" placeholder="Unit (e.g. plate, piece, kg)" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} style={{ marginBottom: 8 }} required />
          <textarea className="admin-search" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} style={{ marginBottom: 10, resize: "vertical" }} />
          <label className="admin-photo-choose">
            <i className="ti ti-photo" aria-hidden="true" />
            {imageFile ? imageFile.name : "Choose photo"}
            <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files[0] || null)} style={{ display: "none" }} />
          </label>
          {formError && <p style={{ fontSize: 12, color: "var(--a-danger-text)", marginBottom: 10 }}>{formError}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={saving} className="admin-btn-primary" style={{ flex: 1 }}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Add item"}
            </button>
            {editingId && <button type="button" onClick={resetForm} className="admin-btn-secondary" style={{ padding: "9px 14px" }}>Cancel</button>}
          </div>
        </form>
      </div>

      {showNewCategoryModal && (
        <div className="menu-modal-scrim" onClick={cancelNewCategory}>
          <div className="menu-modal-box" onClick={(e) => e.stopPropagation()}>
            <p className="menu-modal-title">New category</p>
            <p className="menu-modal-hint">Appears as a new tab here, and as a new tab on the customer Order page once it has at least one item.</p>
            <input
              autoFocus
              className="admin-search"
              placeholder="e.g. Seasonal, Combos"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmNewCategory()}
              style={{ marginBottom: 12 }}
            />
            <div className="menu-modal-actions">
              <button type="button" className="admin-btn-sm" onClick={cancelNewCategory}>Cancel</button>
              <button type="button" className="admin-btn-primary" style={{ width: "auto", padding: "8px 16px" }} onClick={confirmNewCategory}>
                Add category
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .admin-section-title { font-size: 14px; font-weight: 500; margin-bottom: 10px; }
        .admin-two-col { display: grid; grid-template-columns: 1fr; gap: 18px; }
        @media (min-width: 900px) { .admin-two-col { grid-template-columns: 1.5fr 1fr; } }
        .admin-search { width: 100%; border: 1px solid var(--a-border); border-radius: 6px; padding: 8px 12px; font-size: 13px; font-family: var(--font-body); box-sizing: border-box; }
        .admin-form-panel { background: var(--a-panel); border: 1px solid var(--a-border); border-radius: var(--a-radius); padding: 16px; align-self: start; }
        .admin-btn-primary { padding: 10px; background: var(--a-green); color: #fff; border: none; border-radius: 6px; font-size: 13px; }
        .admin-btn-secondary { background: var(--a-bg); border: 1px solid var(--a-border); border-radius: 6px; font-size: 13px; }
        .admin-btn-sm { border: 1px solid var(--a-border); background: var(--a-panel); border-radius: 6px; padding: 6px 12px; font-size: 11.5px; white-space: nowrap; }
        .admin-btn-xs { border: 1px solid var(--a-border); background: var(--a-panel); border-radius: 6px; padding: 5px 10px; font-size: 11.5px; white-space: nowrap; color: var(--a-text-secondary); }
        .admin-btn-xs.danger { color: var(--a-danger-text); }
        .admin-btn-xs.active { background: var(--a-bg); color: var(--a-text-primary); }
        .admin-photo-choose {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          width: 100%; box-sizing: border-box; padding: 9px; margin-bottom: 10px;
          border: 1px dashed var(--a-border); border-radius: 6px; font-size: 12.5px;
          color: var(--a-text-secondary); cursor: pointer;
        }

        .menu-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
        .menu-cat-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
        .menu-cat-tab {
          padding: 7px 15px; border-radius: 20px; border: 1px solid var(--a-border);
          background: var(--a-panel); font-size: 12.5px; color: var(--a-text-secondary); white-space: nowrap;
        }
        .menu-cat-tab.active { background: var(--a-green); color: #fff; border-color: var(--a-green); }
        .menu-view-toggle { display: flex; border: 1px solid var(--a-border); border-radius: 6px; overflow: hidden; flex-shrink: 0; }
        .menu-view-btn { padding: 6px 12px; background: var(--a-panel); border: none; color: var(--a-text-muted); font-size: 14px; display: flex; align-items: center; }
        .menu-view-btn.active { background: var(--a-green); color: #fff; }
        .menu-view-btn + .menu-view-btn { border-left: 1px solid var(--a-border); }

        .menu-empty {
          background: var(--a-panel); border: 1px solid var(--a-border); border-radius: var(--a-radius);
          padding: 30px; text-align: center; color: var(--a-text-muted); font-size: 12.5px;
        }

        .menu-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; padding: 12px 14px; }
        .menu-row-wrap { border-bottom: 1px solid var(--a-border); }
        .menu-row-wrap:last-child { border-bottom: none; }
        .menu-row-info { display: flex; align-items: center; gap: 12px; flex: 1 1 240px; min-width: 0; }
        .menu-row-thumb { width: 40px; height: 40px; border-radius: 8px; object-fit: cover; flex-shrink: 0; }
        .menu-row-thumb-empty { background: var(--a-bg); }
        .menu-row-text { min-width: 0; }
        .menu-row-name-line { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .menu-row-name { font-size: 13.5px; font-weight: 600; color: var(--a-text-primary); }
        .menu-row-meta { margin: 3px 0 0; font-size: 11.5px; color: var(--a-text-secondary); }

        .status-pill { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 999px; white-space: nowrap; }
        .status-pill.gold { background: var(--a-warning-bg); color: var(--a-warning-text); }
        .status-pill.red { background: var(--a-danger-bg); color: var(--a-danger-text); }
        .status-pill.muted { background: var(--a-bg); color: var(--a-text-secondary); }

        .menu-row-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .action-group { display: flex; gap: 5px; flex-wrap: wrap; }
        .action-divider { width: 1px; height: 18px; background: var(--a-border); flex-shrink: 0; }
        @media (max-width: 700px) { .action-divider { display: none; } }

        .toggle-chip {
          border: 1px solid var(--a-border); background: var(--a-panel); color: var(--a-text-secondary);
          border-radius: 999px; padding: 4px 10px; font-size: 10.5px; font-weight: 600; white-space: nowrap;
        }
        .toggle-chip.on.gold { border-color: var(--a-accent); background: var(--a-warning-bg); color: var(--a-warning-text); }
        .toggle-chip.on.red { border-color: var(--a-danger-text); background: var(--a-danger-bg); color: var(--a-danger-text); }

        .menu-card-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
        @media (min-width: 640px) { .menu-card-grid { grid-template-columns: repeat(3, 1fr); } }
        .menu-grid-card-wrap { background: var(--a-panel); border: 1px solid var(--a-border); border-radius: 12px; overflow: hidden; }
        .menu-grid-card { display: flex; flex-direction: column; }
        .menu-grid-photo { width: 100%; height: 100px; object-fit: cover; }
        .menu-grid-photo-empty { background: var(--a-bg); }
        .menu-grid-card-body { padding: 10px; display: flex; flex-direction: column; gap: 6px; }
        .menu-grid-card-tags { display: flex; gap: 5px; flex-wrap: wrap; }
        .menu-grid-card-body .menu-row-actions { gap: 6px; }
        .menu-grid-card-body .action-divider { display: none; }
        .menu-grid-card-body .action-group { gap: 4px; }

        .admin-photo-remove {
          position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%;
          background: var(--a-danger-text); color: #fff; border: 2px solid var(--a-bg); font-size: 10px;
          display: flex; align-items: center; justify-content: center; line-height: 1;
        }
        .admin-photo-add {
          width: 64px; height: 64px; border-radius: 8px; border: 1px dashed var(--a-border);
          display: flex; align-items: center; justify-content: center; font-size: 11px;
          color: var(--a-text-secondary); cursor: pointer; text-align: center;
        }
        .admin-note { font-size: 11px; color: var(--a-text-secondary); background: var(--a-bg); border: 1px solid var(--a-border); border-radius: 8px; padding: 8px 10px; margin: -4px 0 10px; }
        .admin-recipe-editor { padding: 12px 14px; background: var(--a-bg); border-top: 1px solid var(--a-border); }
        .admin-inline-input { border: 1px solid var(--a-border); border-radius: 6px; padding: 5px 6px; font-size: 12px; }
        .admin-link-btn { border: none; background: none; color: var(--a-danger-text); cursor: pointer; font-size: 12px; padding: 0; }

        .menu-modal-scrim {
          position: fixed; inset: 0; background: rgba(28,35,32,0.45);
          display: flex; align-items: center; justify-content: center; z-index: 50; padding: 16px;
        }
        .menu-modal-box { background: var(--a-panel); border-radius: 12px; padding: 20px; width: 320px; max-width: 100%; box-sizing: border-box; }
        .menu-modal-title { font-size: 15px; font-weight: 500; margin: 0 0 4px; }
        .menu-modal-hint { font-size: 12px; color: var(--a-text-secondary); margin: 0 0 14px; }
        .menu-modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
      `}</style>
    </AdminPage>
  );
}
