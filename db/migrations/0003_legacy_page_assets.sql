BEGIN;

ALTER TABLE pojok_baca.book_pages
    ADD COLUMN asset_key text,
    ADD COLUMN crop_y integer CHECK (crop_y >= 0),
    ADD COLUMN crop_height integer CHECK (crop_height > 0),
    ADD CONSTRAINT book_pages_crop_check CHECK (
        (crop_y IS NULL AND crop_height IS NULL)
        OR (asset_key IS NOT NULL AND crop_y IS NOT NULL AND crop_height IS NOT NULL)
    );

COMMIT;
