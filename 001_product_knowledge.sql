-- 001_product_knowledge.sql
-- Target: PostgreSQL 15+
-- Assumed existing table: products(id bigint, name, color_and_size, price, stock, status)
--   * If products.id is uuid, replace every "product_id bigint" below with "product_id uuid".
--   * Partial indexes and the product_cards view assume products.status = 'active' means sellable.
--   * If the platform serves several merchants, add store_id to every new table
--     and filter on it in every query / bot tool (tenant isolation).
--
-- Design rule: exact facts (price, stock, shipping, warranty duration) live in typed columns
-- and are served to the bot through deterministic tools. Persuasive prose (description,
-- key_features, policy text) lives in separate, cold tables loaded on demand.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Categories (normalized instead of a free-text column) ----------------------
CREATE TABLE product_categories (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parent_id bigint REFERENCES product_categories(id) ON DELETE SET NULL,
  slug      text NOT NULL UNIQUE,
  name      text NOT NULL
);

-- 2. Small, exact, hot facts stay on products ------------------------------------
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category_id     bigint REFERENCES product_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS warranty_months smallint CHECK (warranty_months >= 0),
  ADD COLUMN IF NOT EXISTS return_days     smallint CHECK (return_days >= 0),
  ADD COLUMN IF NOT EXISTS shipping_class  text NOT NULL DEFAULT 'standard'
                                           CHECK (shipping_class IN ('standard', 'bulky', 'fragile')),
  ADD COLUMN IF NOT EXISTS free_shipping   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at      timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN products.warranty_months IS 'NULL = unknown (bot must escalate, never guess); 0 = explicitly no warranty';
COMMENT ON COLUMN products.return_days     IS 'NULL = unknown (bot must escalate, never guess); 0 = explicitly no returns';

CREATE INDEX products_category_active_idx ON products (category_id) WHERE status = 'active';
CREATE INDEX products_name_trgm_idx       ON products USING gin (name gin_trgm_ops);

-- 3. Cold, long-form content (1:1) - never selected by default -------------------
CREATE FUNCTION is_valid_key_features(f jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_typeof(f) = 'array'
     AND jsonb_array_length(f) <= 8
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(f) e
       WHERE jsonb_typeof(e) <> 'string' OR length(e #>> '{}') > 120
     )
$$;

CREATE TABLE product_content (
  product_id   bigint PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  description  text,
  key_features jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (is_valid_key_features(key_features)),
  specs        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(specs) = 'object'),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 4. Policies: written once, scoped to a category or to the whole store ----------
CREATE TABLE store_policies (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('warranty', 'return', 'payment', 'shipping', 'general')),
  category_id bigint REFERENCES product_categories(id) ON DELETE CASCADE,  -- NULL = whole store
  title       text NOT NULL,
  body        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX store_policies_lookup_idx ON store_policies (kind, category_id) WHERE is_active;

-- Most specific policy wins: category-level first, then store-wide.
CREATE FUNCTION get_policy(p_kind text, p_category_id bigint)
RETURNS TABLE (policy_title text, policy_body text)
LANGUAGE sql STABLE AS $$
  SELECT sp.title, sp.body
  FROM store_policies sp
  WHERE sp.kind = p_kind AND sp.is_active
    AND (sp.category_id = p_category_id OR sp.category_id IS NULL)
  ORDER BY sp.category_id IS NULL   -- false (category-specific) sorts first
  LIMIT 1
$$;

-- 5. Shipping: cost depends on destination + class, not on the product alone -----
CREATE TABLE shipping_zones (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name      text NOT NULL,
  regions   text[] NOT NULL CHECK (cardinality(regions) > 0),  -- normalized city / province names or codes
  is_active boolean NOT NULL DEFAULT true
);
CREATE INDEX shipping_zones_regions_idx ON shipping_zones USING gin (regions);

CREATE TABLE shipping_rates (
  zone_id        bigint NOT NULL REFERENCES shipping_zones(id) ON DELETE CASCADE,
  shipping_class text   NOT NULL CHECK (shipping_class IN ('standard', 'bulky', 'fragile')),
  cost           numeric(12,2) NOT NULL CHECK (cost >= 0),
  free_over      numeric(12,2) CHECK (free_over >= 0),          -- order total threshold; NULL = never free
  eta_days_min   smallint,
  eta_days_max   smallint,
  PRIMARY KEY (zone_id, shipping_class)
);

-- Zero rows = unknown destination -> the bot asks for the city or escalates. It never guesses a price.
CREATE FUNCTION quote_shipping(p_product_id bigint, p_region text, p_order_total numeric DEFAULT NULL)
RETURNS TABLE (zone_name text, cost numeric, eta_days_min smallint, eta_days_max smallint)
LANGUAGE sql STABLE AS $$
  SELECT z.name,
         CASE WHEN p.free_shipping OR p_order_total >= r.free_over THEN 0::numeric ELSE r.cost END,
         r.eta_days_min,
         r.eta_days_max
  FROM products p
  JOIN shipping_zones z ON z.is_active AND p_region = ANY (z.regions)
  JOIN shipping_rates r ON r.zone_id = z.id AND r.shipping_class = p.shipping_class
  WHERE p.id = p_product_id
  LIMIT 1
$$;

-- 6. Variants: price and stock per color/size (recommended) ----------------------
-- A single products.stock cannot tell the bot whether "red / L" is available.
CREATE TABLE product_variants (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id     bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku            text UNIQUE,
  option_label   text NOT NULL,              -- what the bot says, e.g. "أحمر / L"
  color          text,
  size           text,
  price          numeric(12,2) NOT NULL CHECK (price >= 0),
  stock          integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  stock_reserved integer NOT NULL DEFAULT 0 CHECK (stock_reserved >= 0),
  is_active      boolean NOT NULL DEFAULT true,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX product_variants_option_uq
  ON product_variants (product_id, coalesce(color, ''), coalesce(size, ''));

-- Backfill: one default variant per product. Split color_and_size into color/size afterwards,
-- with a script that matches your actual format. products.price / products.stock stay in place
-- (deprecated) until the application has switched to variants.
INSERT INTO product_variants (product_id, option_label, price, stock)
SELECT id, coalesce(nullif(color_and_size, ''), 'default'), price::numeric(12,2), greatest(stock, 0)
FROM products;

-- 7. The compact "card" the bot sees by default (about 60-90 tokens per product) ---
CREATE VIEW product_cards AS
SELECT p.id,
       p.name,
       c.name                                                       AS category,
       v.price_from,
       v.price_to,
       coalesce(v.available_units, 0) > 0                           AS in_stock,
       coalesce(v.available_units, 0) BETWEEN 1 AND 5               AS low_stock,
       p.warranty_months,
       p.return_days,
       p.free_shipping,
       jsonb_path_query_array(pc.key_features, '$[0 to 2]')         AS top_features,
       pc.description IS NOT NULL                                   AS has_details
FROM products p
LEFT JOIN product_categories c ON c.id = p.category_id
LEFT JOIN product_content   pc ON pc.product_id = p.id
LEFT JOIN LATERAL (
  SELECT min(pv.price)                    AS price_from,
         max(pv.price)                    AS price_to,
         sum(pv.stock - pv.stock_reserved) AS available_units
  FROM product_variants pv
  WHERE pv.product_id = p.id AND pv.is_active
) v ON true
WHERE p.status = 'active';

COMMIT;

-- DOWN (manual rollback):
--   DROP VIEW product_cards;
--   DROP TABLE product_variants, shipping_rates, shipping_zones, store_policies, product_content;
--   DROP FUNCTION quote_shipping(bigint, text, numeric), get_policy(text, bigint), is_valid_key_features(jsonb);
--   ALTER TABLE products DROP COLUMN category_id, DROP COLUMN warranty_months, DROP COLUMN return_days,
--                        DROP COLUMN shipping_class, DROP COLUMN free_shipping;
--   DROP TABLE product_categories;
