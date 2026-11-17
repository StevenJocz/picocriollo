using Microsoft.EntityFrameworkCore;

namespace PicoCriollo.Infrastructure
{
    /// <summary>
    /// SQL idempotente. app_users, app_sessions, farm_data y las pc_* son las de la app actual (mismas columnas), para poder
    /// arrancar la API sobre una base vacía; las de prefijo api_ son propias de la API. Las del mercado (publicaciones, subastas,
    /// operaciones, mensajes, facturas, propiedad y bloqueos de aves) comparten tablas e índices con la app actual. Nunca borra ni altera datos existentes.
    /// </summary>
    public static class Esquema
    {
        public const string Sql = """
            CREATE TABLE IF NOT EXISTS app_users (
              id uuid PRIMARY KEY,
              email text NOT NULL UNIQUE,
              password_hash text NOT NULL,
              created_at timestamptz NOT NULL DEFAULT now(),
              profile jsonb NOT NULL DEFAULT '{}'::jsonb
            );
            CREATE TABLE IF NOT EXISTS app_sessions (
              token_hash char(64) PRIMARY KEY,
              user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
              expires_at timestamptz NOT NULL,
              created_at timestamptz NOT NULL DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS farm_data (
              user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
              data jsonb NOT NULL,
              version bigint NOT NULL DEFAULT 1,
              updated_at timestamptz NOT NULL DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS api_refresh_tokens (
              token_hash text PRIMARY KEY,
              user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
              expires_at timestamptz NOT NULL,
              created_at timestamptz NOT NULL,
              revoked_at timestamptz NULL,
              replaced_by text NULL
            );
            CREATE INDEX IF NOT EXISTS api_refresh_tokens_user_id_idx ON api_refresh_tokens (user_id);
            CREATE TABLE IF NOT EXISTS api_password_resets (
              token_hash text PRIMARY KEY,
              user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
              expires_at timestamptz NOT NULL,
              created_at timestamptz NOT NULL
            );
            CREATE INDEX IF NOT EXISTS api_password_resets_user_id_idx ON api_password_resets (user_id);
            CREATE TABLE IF NOT EXISTS pc_bird_ownership (
              id text PRIMARY KEY,
              data jsonb NOT NULL
            );
            CREATE TABLE IF NOT EXISTS pc_ownership_history (
              id text PRIMARY KEY,
              data jsonb NOT NULL
            );
            CREATE TABLE IF NOT EXISTS pc_bird_locks (
              id text PRIMARY KEY,
              data jsonb NOT NULL
            );
            CREATE TABLE IF NOT EXISTS pc_listings (
              id text PRIMARY KEY,
              data jsonb NOT NULL
            );
            CREATE INDEX IF NOT EXISTS pc_listings_sellerid_idx ON pc_listings ((data->>'sellerId'));
            CREATE INDEX IF NOT EXISTS pc_listings_birdid_idx ON pc_listings ((data->>'birdId'));
            CREATE INDEX IF NOT EXISTS pc_listings_status_idx ON pc_listings ((data->>'status'));
            CREATE TABLE IF NOT EXISTS pc_interests (
              id text PRIMARY KEY,
              data jsonb NOT NULL
            );
            CREATE INDEX IF NOT EXISTS pc_interests_userid_idx ON pc_interests ((data->>'userId'));
            CREATE UNIQUE INDEX IF NOT EXISTS pc_interests_listingid_userid_uq ON pc_interests ((data->>'listingId'), (data->>'userId'));
            CREATE TABLE IF NOT EXISTS pc_bids (
              id text PRIMARY KEY,
              data jsonb NOT NULL
            );
            CREATE INDEX IF NOT EXISTS pc_bids_listingid_idx ON pc_bids ((data->>'listingId'));
            CREATE INDEX IF NOT EXISTS pc_bids_bidderid_idx ON pc_bids ((data->>'bidderId'));
            CREATE UNIQUE INDEX IF NOT EXISTS pc_bids_listingid_bidderid_idempotencykey_uq ON pc_bids ((data->>'listingId'), (data->>'bidderId'), (data->>'idempotencyKey'));
            CREATE TABLE IF NOT EXISTS pc_operations (
              id text PRIMARY KEY,
              data jsonb NOT NULL
            );
            CREATE INDEX IF NOT EXISTS pc_operations_listingid_idx ON pc_operations ((data->>'listingId'));
            CREATE INDEX IF NOT EXISTS pc_operations_sellerid_idx ON pc_operations ((data->>'sellerId'));
            CREATE INDEX IF NOT EXISTS pc_operations_buyerid_idx ON pc_operations ((data->>'buyerId'));
            CREATE INDEX IF NOT EXISTS pc_operations_status_idx ON pc_operations ((data->>'status'));
            CREATE TABLE IF NOT EXISTS pc_threads (
              id text PRIMARY KEY,
              data jsonb NOT NULL
            );
            CREATE INDEX IF NOT EXISTS pc_threads_listingid_idx ON pc_threads ((data->>'listingId'));
            CREATE INDEX IF NOT EXISTS pc_threads_operationid_idx ON pc_threads ((data->>'operationId'));
            CREATE TABLE IF NOT EXISTS pc_messages (
              id text PRIMARY KEY,
              data jsonb NOT NULL
            );
            CREATE INDEX IF NOT EXISTS pc_messages_threadid_idx ON pc_messages ((data->>'threadId'));
            CREATE TABLE IF NOT EXISTS pc_passports (
              id text PRIMARY KEY,
              data jsonb NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS pc_passports_birdid_uq ON pc_passports ((data->>'birdId'));
            CREATE TABLE IF NOT EXISTS pc_transfer_receipts (
              id text PRIMARY KEY,
              data jsonb NOT NULL
            );
            CREATE INDEX IF NOT EXISTS pc_transfer_receipts_birdid_idx ON pc_transfer_receipts ((data->>'birdId'));
            CREATE INDEX IF NOT EXISTS pc_transfer_receipts_sellerid_idx ON pc_transfer_receipts ((data->>'sellerId'));
            CREATE INDEX IF NOT EXISTS pc_transfer_receipts_buyerid_idx ON pc_transfer_receipts ((data->>'buyerId'));
            CREATE UNIQUE INDEX IF NOT EXISTS pc_transfer_receipts_code_uq ON pc_transfer_receipts ((data->>'code'));
            CREATE UNIQUE INDEX IF NOT EXISTS pc_transfer_receipts_operationid_uq ON pc_transfer_receipts ((data->>'operationId'));
            CREATE TABLE IF NOT EXISTS pc_ratings (
              id text PRIMARY KEY,
              data jsonb NOT NULL
            );
            CREATE INDEX IF NOT EXISTS pc_ratings_rateeid_idx ON pc_ratings ((data->>'rateeId'));
            CREATE UNIQUE INDEX IF NOT EXISTS pc_ratings_operationid_raterid_uq ON pc_ratings ((data->>'operationId'), (data->>'raterId'));
            CREATE TABLE IF NOT EXISTS pc_invoices (
              id text PRIMARY KEY,
              data jsonb NOT NULL
            );
            CREATE INDEX IF NOT EXISTS pc_invoices_sellerid_idx ON pc_invoices ((data->>'sellerId'));
            CREATE INDEX IF NOT EXISTS pc_invoices_buyerid_idx ON pc_invoices ((data->>'buyerId'));
            CREATE UNIQUE INDEX IF NOT EXISTS pc_invoices_number_uq ON pc_invoices ((data->>'number'));
            CREATE UNIQUE INDEX IF NOT EXISTS pc_invoices_operationid_uq ON pc_invoices ((data->>'operationId'));
            CREATE TABLE IF NOT EXISTS pc_outbox (
              id text PRIMARY KEY,
              data jsonb NOT NULL
            );
            CREATE INDEX IF NOT EXISTS pc_outbox_status_idx ON pc_outbox ((data->>'status'));
            CREATE UNIQUE INDEX IF NOT EXISTS pc_outbox_dedupekey_uq ON pc_outbox ((data->>'dedupeKey'));
            CREATE TABLE IF NOT EXISTS pc_audit_log (
              id text PRIMARY KEY,
              data jsonb NOT NULL
            );
            CREATE INDEX IF NOT EXISTS pc_audit_log_actorid_idx ON pc_audit_log ((data->>'actorId'));
            CREATE INDEX IF NOT EXISTS pc_audit_log_targetid_idx ON pc_audit_log ((data->>'targetId'));
            CREATE INDEX IF NOT EXISTS pc_bird_ownership_ownerid_idx ON pc_bird_ownership ((data->>'ownerId'));
            CREATE INDEX IF NOT EXISTS pc_ownership_history_birdid_idx ON pc_ownership_history ((data->>'birdId'));
            CREATE INDEX IF NOT EXISTS pc_bird_locks_listingid_idx ON pc_bird_locks ((data->>'listingId'));
            CREATE INDEX IF NOT EXISTS pc_bird_locks_operationid_idx ON pc_bird_locks ((data->>'operationId'));
            CREATE INDEX IF NOT EXISTS pc_bird_locks_lotid_idx ON pc_bird_locks ((data->>'lotId'));
            CREATE UNIQUE INDEX IF NOT EXISTS pc_bird_locks_birdid_uq ON pc_bird_locks ((data->>'birdId')) WHERE (data->>'status') = 'active';
            CREATE TABLE IF NOT EXISTS pc_media (
              id text PRIMARY KEY,
              mime text NOT NULL,
              owner_id text NOT NULL,
              bytes bytea NOT NULL,
              created_at timestamptz NOT NULL DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS api_dispositivos (
              id uuid PRIMARY KEY,
              user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
              token text NOT NULL UNIQUE,
              plataforma text NOT NULL,
              creado_en timestamptz NOT NULL
            );
            CREATE INDEX IF NOT EXISTS api_dispositivos_user_id_idx ON api_dispositivos (user_id);
            CREATE TABLE IF NOT EXISTS pc_follows (
              id text PRIMARY KEY,
              data jsonb NOT NULL
            );
            CREATE INDEX IF NOT EXISTS pc_follows_followerid_idx ON pc_follows ((data->>'followerId'));
            CREATE INDEX IF NOT EXISTS pc_follows_followingid_idx ON pc_follows ((data->>'followingId'));
            CREATE UNIQUE INDEX IF NOT EXISTS pc_follows_followerid_followingid_uq ON pc_follows ((data->>'followerId'), (data->>'followingId'));
            CREATE TABLE IF NOT EXISTS pc_posts (
              id text PRIMARY KEY,
              data jsonb NOT NULL
            );
            CREATE INDEX IF NOT EXISTS pc_posts_authorid_idx ON pc_posts ((data->>'authorId'));
            CREATE TABLE IF NOT EXISTS pc_media_items (
              id text PRIMARY KEY,
              data jsonb NOT NULL
            );
            CREATE INDEX IF NOT EXISTS pc_media_items_ownerid_idx ON pc_media_items ((data->>'ownerId'));
            CREATE INDEX IF NOT EXISTS pc_media_items_postid_idx ON pc_media_items ((data->>'postId'));
            CREATE TABLE IF NOT EXISTS pc_reel_interests (
              id text PRIMARY KEY,
              data jsonb NOT NULL
            );
            CREATE TABLE IF NOT EXISTS pc_post_likes (
              id text PRIMARY KEY,
              data jsonb NOT NULL
            );
            CREATE INDEX IF NOT EXISTS pc_post_likes_postid_idx ON pc_post_likes ((data->>'postId'));
            CREATE INDEX IF NOT EXISTS pc_post_likes_userid_idx ON pc_post_likes ((data->>'userId'));
            CREATE UNIQUE INDEX IF NOT EXISTS pc_post_likes_postid_userid_uq ON pc_post_likes ((data->>'postId'), (data->>'userId'));
            CREATE TABLE IF NOT EXISTS pc_post_comments (
              id text PRIMARY KEY,
              data jsonb NOT NULL
            );
            CREATE INDEX IF NOT EXISTS pc_post_comments_postid_idx ON pc_post_comments ((data->>'postId'));
            CREATE INDEX IF NOT EXISTS pc_post_comments_parentid_idx ON pc_post_comments ((data->>'parentId'));
            CREATE INDEX IF NOT EXISTS pc_post_comments_authorid_idx ON pc_post_comments ((data->>'authorId'));
            CREATE TABLE IF NOT EXISTS pc_reports (
              id text PRIMARY KEY,
              data jsonb NOT NULL
            );
            CREATE INDEX IF NOT EXISTS pc_reports_status_idx ON pc_reports ((data->>'status'));
            CREATE INDEX IF NOT EXISTS pc_reports_targetid_idx ON pc_reports ((data->>'targetId'));
            CREATE TABLE IF NOT EXISTS pc_notifications (
              id text PRIMARY KEY,
              data jsonb NOT NULL
            );
            CREATE INDEX IF NOT EXISTS pc_notifications_userid_idx ON pc_notifications ((data->>'userId'));
            CREATE UNIQUE INDEX IF NOT EXISTS pc_notifications_userid_dedupekey_uq ON pc_notifications ((data->>'userId'), (data->>'dedupeKey'));
            CREATE TABLE IF NOT EXISTS pc_preferences (
              id text PRIMARY KEY,
              data jsonb NOT NULL
            );
            """;

        /// <summary>
        /// Se ejecuta con un comando directo y no con ExecuteSqlRaw: este trata las llaves del SQL (como '{}'::jsonb) como marcas de formato.
        /// </summary>
        public static async Task AplicarAsync(DBContext contexto, CancellationToken cancelar = default)
        {
            var conexion = contexto.Database.GetDbConnection();
            bool cerrar = conexion.State != System.Data.ConnectionState.Open;
            if (cerrar) await conexion.OpenAsync(cancelar);
            try
            {
                await using var comando = conexion.CreateCommand();
                comando.CommandText = Sql;
                await comando.ExecuteNonQueryAsync(cancelar);
            }
            finally { if (cerrar) await conexion.CloseAsync(); }
        }
    }
}
