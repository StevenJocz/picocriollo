using Microsoft.EntityFrameworkCore;
using PicoCriollo.Domain.Entities.GranjaE;
using PicoCriollo.Domain.Entities.MercadoE;
using PicoCriollo.Domain.Entities.NotificacionesE;
using PicoCriollo.Domain.Entities.UsuarioE;

namespace PicoCriollo.Infrastructure
{
    /// <summary>Nombres de las tablas pc_* que usa el mercado (las mismas que crea la app actual).</summary>
    public static class TablasMercado
    {
        public const string Publicaciones = "pc_listings", Bloqueos = "pc_bird_locks", Intereses = "pc_interests", Ofertas = "pc_bids", Operaciones = "pc_operations",
            Conversaciones = "pc_threads", Mensajes = "pc_messages", Pasaportes = "pc_passports", Comprobantes = "pc_transfer_receipts", Valoraciones = "pc_ratings",
            Facturas = "pc_invoices", Propiedad = "pc_bird_ownership", HistorialPropiedad = "pc_ownership_history", Auditoria = "pc_audit_log", Salida = "pc_outbox",
            Notificaciones = "pc_notifications", Preferencias = "pc_preferences", Seguimientos = "pc_follows", PublicacionesPerfil = "pc_posts", MeGusta = "pc_post_likes", ComentariosPerfil = "pc_post_comments", Media = "pc_media_items", InteresesReels = "pc_reel_interests", Denuncias = "pc_reports";

        public static readonly string[] Todas = [Publicaciones, Bloqueos, Intereses, Ofertas, Operaciones, Conversaciones, Mensajes, Pasaportes, Comprobantes, Valoraciones, Facturas, Propiedad, HistorialPropiedad, Auditoria, Salida, Notificaciones, Preferencias, Seguimientos, PublicacionesPerfil, MeGusta, ComentariosPerfil, Media, InteresesReels, Denuncias];
    }

    public class DBContext : DbContext
    {
        // Se inyecta con AddDbContext (un contexto por petición): nada de crear uno por consulta ni de liberarlo a mano.
        public DBContext(DbContextOptions<DBContext> opciones) : base(opciones) { }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            modelBuilder.Entity<UsuarioE>().HasIndex(u => u.Correo).IsUnique();
            modelBuilder.Entity<RefrescoE>().HasIndex(r => r.IdUsuario);
            modelBuilder.Entity<RestablecimientoE>().HasIndex(r => r.IdUsuario);
            modelBuilder.Entity<DispositivoE>().HasIndex(d => d.Token).IsUnique();

            // Las tablas del mercado son (id text, data jsonb): una misma clase para todas, una entidad por tabla.
            foreach (string tabla in TablasMercado.Todas)
                modelBuilder.SharedTypeEntity<FilaDocumento>(tabla, fila =>
                {
                    fila.ToTable(tabla);
                    fila.HasKey(f => f.Id);
                    fila.Property(f => f.Id).HasColumnName("id");
                    fila.Property(f => f.Datos).HasColumnName("data").HasColumnType("jsonb");
                });
        }

        // Usuario
        public virtual DbSet<UsuarioE> UsuarioEs { get; set; } = null!;
        public virtual DbSet<SesionE> SesionEs { get; set; } = null!;
        public virtual DbSet<RefrescoE> RefrescoEs { get; set; } = null!;
        public virtual DbSet<RestablecimientoE> RestablecimientoEs { get; set; } = null!;

        // Archivos
        public virtual DbSet<MediaE> MediaEs { get; set; } = null!;

        // Notificaciones
        public virtual DbSet<DispositivoE> DispositivoEs { get; set; } = null!;

        // Granja
        public virtual DbSet<GranjaE> GranjaEs { get; set; } = null!;
    }
}
