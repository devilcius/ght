CREATE TABLE project_image_variants (
  image_id TEXT NOT NULL REFERENCES project_images(id) ON DELETE CASCADE,
  width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 1600),
  height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 10000),
  object_key TEXT NOT NULL UNIQUE,
  PRIMARY KEY(image_id,width)
);
CREATE TABLE property_image_variants (
  image_id TEXT NOT NULL REFERENCES property_images(id) ON DELETE CASCADE,
  width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 1600),
  height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 10000),
  object_key TEXT NOT NULL UNIQUE,
  PRIMARY KEY(image_id,width)
);
