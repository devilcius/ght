CREATE TABLE properties (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  operation TEXT NOT NULL CHECK(operation IN ('sale','rent')),
  availability TEXT NOT NULL CHECK(availability IN ('available','reserved','sold')),
  location TEXT NOT NULL DEFAULT '',
  price_eur INTEGER CHECK(price_eur IS NULL OR price_eur>=0),
  area_m2 REAL CHECK(area_m2 IS NULL OR area_m2>0),
  bedrooms INTEGER CHECK(bedrooms IS NULL OR bedrooms>=0),
  bathrooms INTEGER CHECK(bathrooms IS NULL OR bathrooms>=0),
  description TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)),
  cover_image_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE property_images (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  thumbnail_key TEXT,
  alt TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX property_images_order ON property_images(property_id,position);
