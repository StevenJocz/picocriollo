-- Borra la comunidad de ejemplo de Pico Criollo (cuentas @semilla.pico-criollo.invalid y todo lo que crearon). No toca cuentas reales.
BEGIN;
CREATE TEMP TABLE seed_users ON COMMIT DROP AS SELECT id::text AS id FROM app_users WHERE email LIKE '%@semilla.pico-criollo.invalid';
CREATE TEMP TABLE seed_posts ON COMMIT DROP AS SELECT id FROM pc_posts WHERE data->>'authorId' IN (SELECT id FROM seed_users);
CREATE TEMP TABLE seed_listings ON COMMIT DROP AS SELECT id FROM pc_listings WHERE data->>'sellerId' IN (SELECT id FROM seed_users);
DELETE FROM pc_post_likes WHERE data->>'userId' IN (SELECT id FROM seed_users) OR data->>'postId' IN (SELECT id FROM seed_posts);
DELETE FROM pc_post_comments WHERE data->>'authorId' IN (SELECT id FROM seed_users) OR data->>'postId' IN (SELECT id FROM seed_posts);
DELETE FROM pc_posts WHERE id IN (SELECT id FROM seed_posts);
DELETE FROM pc_follows WHERE data->>'followerId' IN (SELECT id FROM seed_users) OR data->>'followingId' IN (SELECT id FROM seed_users);
DELETE FROM pc_bird_locks WHERE data->>'listingId' IN (SELECT id FROM seed_listings);
DELETE FROM pc_interests WHERE data->>'listingId' IN (SELECT id FROM seed_listings);
DELETE FROM pc_bids WHERE data->>'listingId' IN (SELECT id FROM seed_listings);
DELETE FROM pc_listings WHERE id IN (SELECT id FROM seed_listings);
DELETE FROM pc_media_items WHERE data->>'ownerId' IN (SELECT id FROM seed_users);
DELETE FROM pc_media WHERE owner_id IN (SELECT id FROM seed_users);
DELETE FROM pc_ownership_history WHERE data->>'ownerId' IN (SELECT id FROM seed_users);
DELETE FROM pc_bird_ownership WHERE data->>'ownerId' IN (SELECT id FROM seed_users);
DELETE FROM pc_notifications WHERE data->>'userId' IN (SELECT id FROM seed_users);
DELETE FROM app_users WHERE id::text IN (SELECT id FROM seed_users);  -- sus granjas y sesiones se borran en cascada
COMMIT;
