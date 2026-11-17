// Redes cuyo perfil se puede enlazar desde la cuenta. Sin dependencias: lo usan el servidor y el navegador.
export type SocialPlatform = 'tiktok' | 'instagram' | 'youtube';
export type SocialLinks = Partial<Record<SocialPlatform, string>>;
export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = ['tiktok', 'instagram', 'youtube'];
export const SOCIAL_LABELS: Record<SocialPlatform, string> = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube' };
