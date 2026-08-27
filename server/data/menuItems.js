// Menu items, backed by PostgreSQL — see server/db/schema.sql.
// Uploaded photos are stored as bytea in the row (cover image) or in
// menu_item_images (extra gallery photos), not on local disk, so they
// persist the same way the rest of the data does.
const pool = require("../config/db");

// Extra photos per item are capped — keeps the gallery UI (and upload
// requests) bounded, same reasoning as the bakery app.
const MAX_GALLERY_IMAGES = 4;

const mapRow = (row) =>
  row && {
    id: row.id,
    name: row.name,
    category: row.category,
    price: row.price === null ? null : Number(row.price),
    unit: row.unit,
    inStock: row.in_stock,
    description: row.description,
    hasImage: !!row.image_data,
    imageUrl: row.image_data ? `/api/menu/${row.id}/image` : null,
    isVeg: row.is_veg,
    spiceLevel: row.spice_level,
    isSpecial: row.is_special && (!row.special_until || new Date(row.special_until) > new Date()),
    isPopular: row.is_popular,
    // Extra gallery photos, in order — cover image (imageUrl above) is separate
    // and always shown first by the client; this is purely the "more photos" set.
    galleryImages: (row.gallery || []).map((g) => `/api/menu/${row.id}/images/${g.id}`)
  };

// Every row-returning query needs the same gallery aggregation, so it lives once here.
const SELECT_WITH_GALLERY = `
  select m.*,
    coalesce(
      json_agg(json_build_object('id', gi.id) order by gi.sort_order, gi.id)
        filter (where gi.id is not null),
      '[]'
    ) as gallery
  from menu_items m
  left join menu_item_images gi on gi.menu_item_id = m.id
`;

exports.MAX_GALLERY_IMAGES = MAX_GALLERY_IMAGES;

exports.getAll = async (category) => {
  const { rows } = category
    ? await pool.query(`${SELECT_WITH_GALLERY} where m.category = $1 group by m.id order by m.id`, [category])
    : await pool.query(`${SELECT_WITH_GALLERY} group by m.id order by m.id`);
  return rows.map(mapRow);
};

exports.getById = async (id) => {
  const { rows } = await pool.query(`${SELECT_WITH_GALLERY} where m.id = $1 group by m.id`, [id]);
  return mapRow(rows[0]);
};

exports.getImage = async (id) => {
  const { rows } = await pool.query("select image_data, image_mime from menu_items where id = $1", [id]);
  if (!rows[0] || !rows[0].image_data) return null;
  return { data: rows[0].image_data, mime: rows[0].image_mime || "image/jpeg" };
};

exports.create = async ({ name, category, price, unit, description, isVeg, spiceLevel, imageBuffer, imageMime }) => {
  const { rows } = await pool.query(
    `insert into menu_items (name, category, price, unit, description, is_veg, spice_level, image_data, image_mime)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [name, category, price, unit || "plate", description || null, isVeg !== false, spiceLevel || null, imageBuffer || null, imageMime || null]
  );
  return exports.getById(rows[0].id);
};

exports.update = async (id, fields) => {
  const setClauses = [];
  const values = [];
  let i = 1;

  const map = {
    name: "name",
    category: "category",
    price: "price",
    unit: "unit",
    description: "description",
    inStock: "in_stock",
    isVeg: "is_veg",
    spiceLevel: "spice_level",
    isSpecial: "is_special",
    specialUntil: "special_until",
    isPopular: "is_popular"
  };

  for (const [key, col] of Object.entries(map)) {
    if (fields[key] !== undefined) {
      setClauses.push(`${col} = $${i++}`);
      values.push(fields[key]);
    }
  }
  if (fields.imageBuffer) {
    setClauses.push(`image_data = $${i++}`);
    values.push(fields.imageBuffer);
    setClauses.push(`image_mime = $${i++}`);
    values.push(fields.imageMime || "image/jpeg");
  }
  if (!setClauses.length) return exports.getById(id);

  values.push(id);
  await pool.query(`update menu_items set ${setClauses.join(", ")} where id = $${i}`, values);
  return exports.getById(id);
};

exports.remove = async (id) => {
  await pool.query("delete from menu_items where id = $1", [id]);
};

// --- gallery images (extra photos beyond the cover image) ---

exports.getGalleryImage = async (menuItemId, imageId) => {
  const { rows } = await pool.query(
    "select image_data, image_mime from menu_item_images where id = $1 and menu_item_id = $2",
    [imageId, menuItemId]
  );
  const row = rows[0];
  if (!row) return null;
  return { data: row.image_data, mime: row.image_mime };
};

exports.addGalleryImage = async (menuItemId, { data, mime }) => {
  const { rows: countRows } = await pool.query(
    "select count(*)::int as count, coalesce(max(sort_order), -1) as max_sort from menu_item_images where menu_item_id = $1",
    [menuItemId]
  );
  if (countRows[0].count >= MAX_GALLERY_IMAGES) {
    const err = new Error(`This item already has the maximum of ${MAX_GALLERY_IMAGES} extra photos`);
    err.status = 400;
    throw err;
  }
  await pool.query(
    "insert into menu_item_images (menu_item_id, image_data, image_mime, sort_order) values ($1, $2, $3, $4)",
    [menuItemId, data, mime, countRows[0].max_sort + 1]
  );
  return exports.getById(menuItemId);
};

exports.removeGalleryImage = async (menuItemId, imageId) => {
  const { rowCount } = await pool.query(
    "delete from menu_item_images where id = $1 and menu_item_id = $2",
    [imageId, menuItemId]
  );
  if (rowCount === 0) return null;
  return exports.getById(menuItemId);
};
