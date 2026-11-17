using System.ComponentModel.DataAnnotations;
namespace PicoCriollo.Domain.Mercado;

public class Denuncia
{
    public string Id { get; set; } = string.Empty;
    public string TargetType { get; set; } = string.Empty;
    public string TargetId { get; set; } = string.Empty;
    public string ReporterId { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public string Status { get; set; } = "abierta";
    public string? Resolution { get; set; }
    public string CreatedAt { get; set; } = string.Empty;
    public string UpdatedAt { get; set; } = string.Empty;
}
public class DenunciaNuevaDto
{
    [Required, MaxLength(20)] public string TargetType { get; set; } = string.Empty;
    [Required, MaxLength(120)] public string TargetId { get; set; } = string.Empty;
    [Required, MinLength(10), MaxLength(500)] public string Reason { get; set; } = string.Empty;
}
public class DecisionModeracionDto
{
    [Required] public string Action { get; set; } = string.Empty;
    [Required, MinLength(5), MaxLength(500)] public string Note { get; set; } = string.Empty;
}
public record DenunciaVista(Denuncia Report, string Reporter, string Target);
