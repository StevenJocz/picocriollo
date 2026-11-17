// Registros y contratos del almacenamiento. Sin imports de Next: se prueba con node --test.
// Las fechas son cadenas ISO 8601 (UTC) para que cada driver las guarde sin conversión.

export type Category = 'incubacion' | 'salud' | 'mantenimiento' | 'inventario' | 'comercial' | 'transferencia' | 'seguridad' | 'sistema';
export type Priority = 'baja' | 'normal' | 'alta' | 'critica';
export type Role = 'user' | 'moderator' | 'admin';

export interface UserRecord { id: string; email: string; passwordHash: string; createdAt: string; displayName?: string; role?: Role; timeZone?: string; contactPhone?: string; avatarId?: string; suspendedAt?: string; suspendedReason?: string; demo?: true; /** Enlaces canónicos a los perfiles del criador en TikTok, Instagram y YouTube. */ social?: { tiktok?: string; instagram?: string; youtube?: string }; /** Ciudad y departamento de la persona: sirve para mostrar primero lo cercano. */ location?: { city: string; region?: string }; }
export interface SessionRecord { id: string; userId: string; expiresAt: string; createdAt: string; }
/** Enlace de restablecimiento de contraseña: `id` es el hash SHA-256 del token (el token en claro solo viaja por correo). */
export interface PasswordResetRecord { id: string; userId: string; expiresAt: string; createdAt: string; }
/** Relación social dirigida: followerId sigue a followingId. */
export interface FollowRecord { id: string; followerId: string; followingId: string; createdAt: string; }
export interface FarmRecord { id: string; data: Record<string, unknown>; version: number; updatedAt: string; }

export interface BirdOwnershipRecord { id: string; ownerId: string; since: string; version: number; }
export interface OwnershipHistoryRecord { id: string; birdId: string; ownerId: string; from: string; to?: string; operationId?: string; }

export type ListingKind = 'fixed' | 'auction' | 'interest';
export type ItemType = 'ave' | 'lote_aves' | 'lote_pollitos' | 'lote_huevos' | 'insumo';
export type ListingItem = { type: 'ave'; birdId: string } | { type: 'lote_pollitos' | 'lote_huevos' | 'insumo'; lotId: string; quantity: number };
export type ListingStatus = 'borrador' | 'publicada' | 'pausada' | 'en_operacion' | 'vendida' | 'retirada' | 'cancelada' | 'rechazada' | 'cerrada_sin_ofertas';
export interface ListingConsent {
  description: string; deliveryZone: string; showPhoto: boolean; showGenealogy: boolean; showReproduction: boolean;
  showBreeder: boolean; breederAlias: string; healthNote: string; shareHistoryReproductive: boolean; shareHistoryHealth: boolean;
}
export interface Ancestor { name: string; code: string; breed: string; sex: string; species?: string; mother?: Ancestor; father?: Ancestor; }
export interface PublicSnapshot {
  name: string; code: string; ring: number | null; breed: string; sex: string; /** Tipo de ave: Gallinas, Patos, Gansos, Pavos… */ species?: string; bornAt: string; ageLabel: string;
  photoId?: string; description: string; deliveryZone: string; healthNote?: string; breeder?: string;
  genealogy?: { mother?: Ancestor; father?: Ancestor }; offspringCount?: number;
  itemType?: ItemType; quantity?: number; title?: string; fertility?: string; photoIds?: string[];
  lotBirds?: { name: string; code: string; sex: string; breed: string; ageLabel: string }[];
  /** Los datos del ave los declara el vendedor; la plataforma no los verifica. */
  declaredBySeller: true;
}
export interface AuctionRules { startingPrice: number; minIncrement: number; reservePrice?: number; antiSniping?: { windowSeconds: number; extendSeconds: number }; }
export interface ListingRecord {
  id: string; birdId: string; itemType?: ItemType; items?: ListingItem[]; photoIds?: string[]; sellerId: string; kind: ListingKind; status: ListingStatus; consent: ListingConsent;
  snapshot: PublicSnapshot; sourceHash: string; needsReview: boolean; price: number; currency: 'COP'; terms: string;
  auction?: AuctionRules; opensAt?: string; closesAt?: string; closedReason?: string; extensions?: number; winningBidId?: string;
  createdAt: string; publishedAt?: string; updatedAt: string; version: number;
}
export interface BirdLockRecord { id: string; birdId: string; lotId?: string; quantity?: number; listingId?: string; operationId?: string; status: 'active' | 'released'; createdAt: string; releasedAt?: string; }
export interface InterestRecord { id: string; listingId: string; userId: string; status: 'activo' | 'retirado'; message: string; revision: number; createdAt: string; updatedAt: string; }

export interface BidRecord { id: string; listingId: string; bidderId: string; amount: number; seq: number; idempotencyKey: string; status: 'valida' | 'superada' | 'ganadora' | 'no_ganadora'; placedAt: string; }
export type OperationStatus = 'solicitud_recibida' | 'aceptada' | 'pago_pendiente' | 'pago_registrado' | 'entrega_pendiente' | 'entrega_confirmada' | 'completada' | 'cancelada' | 'disputada';
export interface OperationRecord {
  id: string; listingId: string; birdId: string; sellerId: string; buyerId: string; origin: 'directa' | 'subasta'; price: number;
  status: OperationStatus; paymentMethod?: string; paymentDeclaredAt?: string; paymentConfirmedAt?: string;
  sellerDeliveredAt?: string; buyerReceivedAt?: string; shareContact: { seller: boolean; buyer: boolean };
  cancelReason?: string; disputeReason?: string; history: { at: string; status: OperationStatus; actorId: string; note?: string }[];
  createdAt: string; updatedAt: string; version: number;
}
export interface ThreadRecord { id: string; listingId: string; operationId?: string; participants: string[]; createdAt: string; }
export interface MessageRecord { id: string; threadId: string; senderId: string; body: string; createdAt: string; hidden?: boolean; }
export interface PassportRecord { id: string; birdId: string; code: string; originRing: number | null; lineage: Record<string, unknown>; updatedAt: string; }
export interface TransferReceiptRecord { id: string; code: string; birdId: string; operationId: string; listingId: string; sellerId: string; buyerId: string; sellerAlias: string; buyerAlias: string; birdName: string; birdCode: string; ring: number | null; price: number; transferredAt: string; hash: string; }
export interface RatingRecord { id: string; operationId: string; raterId: string; rateeId: string; stars: number; comment: string; createdAt: string; }
export interface InvoiceLine { description: string; detail: string[]; itemType: ItemType; unit: 'ave' | 'lote'; quantity: 1; unitPrice: number; total: number; }
export interface InvoiceRecord {
  id: string; number: string; operationId: string; listingId: string; receiptCode: string;
  sellerId: string; buyerId: string; sellerAlias: string; buyerAlias: string;
  lines: InvoiceLine[]; subtotal: number; total: number; currency: 'COP';
  paymentMethod?: string; paymentDeclaredAt?: string; paymentConfirmedAt: string; deliveredAt: string; receivedAt: string; issuedAt: string; hash: string;
}
/** Archivo subido por un usuario (los bytes viven en el MediaStore). `purpose`: foto/video de una publicación del perfil, foto de perfil o miniatura. */
export interface MediaItemRecord {
  id: string; ownerId: string; kind: 'image' | 'video'; mime: string; size: number; purpose: 'post' | 'avatar' | 'thumb';
  thumbOf?: string; postId?: string; width?: number; height?: number; createdAt: string;
}
/** Publicación del perfil (el «muro»): texto y/o fotos y videos. */
export interface PostRecord {
  id: string; authorId: string; text: string; mediaIds: string[]; createdAt: string; updatedAt: string;
  editedAt?: string; hiddenAt?: string; hiddenBy?: string; demo?: true; demoImageUrl?: string;
  /** Video de YouTube, TikTok o Instagram: solo proveedor, id y enlace canónico; el reproductor se construye al mostrarlo. */
  embed?: { provider: 'youtube' | 'tiktok' | 'instagram'; id: string; kind: string; url: string };
  /** Si es un reel compartido: id de la publicación original (siempre la original, nunca otro repost). El contenido se lee de ella al mostrarlo. */
  sharedFromId?: string;
}
/** Me gusta de una publicación del perfil. El id es `<postId>:<userId>`: una sola vez por persona. */
/** Gustos aprendidos de una persona para ordenar sus reels (pesos por etiqueta y por autor, con olvido gradual). */
export interface ReelInterestRecord { id: string; weights: Record<string, number>; authors: Record<string, number>; updatedAt: string; }
export interface PostLikeRecord { id: string; postId: string; userId: string; createdAt: string; }
/** Comentario de una publicación. Máximo dos niveles: comentario y respuestas (`parentId` apunta siempre al comentario principal). */
export interface PostCommentRecord {
  id: string; postId: string; parentId?: string; replyToUserId?: string; authorId: string; text: string; createdAt: string;
  editedAt?: string; hiddenAt?: string; hiddenBy?: string; deletedAt?: string;
}
export interface ReportRecord { id: string; targetType: 'listing' | 'user' | 'message' | 'post' | 'comment'; targetId: string; reporterId: string; reason: string; status: 'abierta' | 'en_revision' | 'resuelta' | 'descartada'; resolution?: string; createdAt: string; updatedAt: string; }

export interface NotificationLink { view: string; id?: string; }
export interface NotificationRecord {
  id: string; userId: string; category: Category; priority: Priority; critical: boolean; type: string; title: string; body: string;
  link: NotificationLink; eventId: string; dedupeKey: string; createdAt: string; readAt?: string;
}
export interface OutboxRecord {
  id: string; type: string; aggregateType: string; aggregateId: string; payload: Record<string, unknown>; dedupeKey: string;
  status: 'pending' | 'processed' | 'failed'; attempts: number; lastError?: string; occurredAt: string; processedAt?: string;
}
export type ChannelId = 'inApp' | 'browser' | 'email' | 'push';
export interface DeliveryRecord { id: string; notificationId: string; userId: string; channel: ChannelId; status: 'pending' | 'sent' | 'failed' | 'skipped'; attempts: number; lastError?: string; notBefore: string; nextAttemptAt?: string; sentAt?: string; }
export interface PreferencesRecord {
  id: string; categories: Record<Category, boolean>; channels: Record<ChannelId, boolean>;
  quietHours: { enabled: boolean; start: string; end: string }; timeZone: string;
  channelCategories: Partial<Record<ChannelId, Category[]>>;
  incubationLeadDays: number; taskLeadDays: number; incubationMarginDays: number; incubationStaleDays: number; digest: 'nunca' | 'diario' | 'semanal'; commercial: { offers: boolean; interests: boolean };
  updatedAt: string;
}
export interface PushSubscriptionRecord { id: string; userId: string; endpoint: string; keys: { p256dh: string; auth: string }; createdAt: string; }
export interface AuditRecord { id: string; actorId: string; action: string; targetType: string; targetId: string; detail: Record<string, unknown>; createdAt: string; }

export interface Collection<T extends { id: string }> {
  get(id: string): Promise<T | undefined>;
  list(filter?: Partial<T>): Promise<T[]>;
  insert(record: T): Promise<void>;
  update(record: T): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface Tx {
  users: Collection<UserRecord>; sessions: Collection<SessionRecord>; farms: Collection<FarmRecord>; follows: Collection<FollowRecord>;
  ownership: Collection<BirdOwnershipRecord>; ownershipHistory: Collection<OwnershipHistoryRecord>;
  listings: Collection<ListingRecord>; locks: Collection<BirdLockRecord>; interests: Collection<InterestRecord>;
  bids: Collection<BidRecord>; operations: Collection<OperationRecord>; threads: Collection<ThreadRecord>; messages: Collection<MessageRecord>;
  passports: Collection<PassportRecord>; receipts: Collection<TransferReceiptRecord>; ratings: Collection<RatingRecord>; invoices: Collection<InvoiceRecord>; posts: Collection<PostRecord>; mediaItems: Collection<MediaItemRecord>; postLikes: Collection<PostLikeRecord>; reelInterests: Collection<ReelInterestRecord>; postComments: Collection<PostCommentRecord>; reports: Collection<ReportRecord>;
  notifications: Collection<NotificationRecord>; outbox: Collection<OutboxRecord>; deliveries: Collection<DeliveryRecord>;
  preferences: Collection<PreferencesRecord>; pushSubscriptions: Collection<PushSubscriptionRecord>; audit: Collection<AuditRecord>;
  passwordResets: Collection<PasswordResetRecord>;
}
export type CollectionName = keyof Tx;

export interface Store { readonly driver: 'file' | 'postgres'; tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T>; }

export interface MediaStore {
  put(input: { id: string; mime: string; bytes: Uint8Array; ownerId: string }): Promise<void>;
  get(id: string): Promise<{ mime: string; bytes: Uint8Array } | undefined>;
  delete(id: string): Promise<void>;
}

export interface UniqueSpec { fields: string[]; where?: Record<string, string | number | boolean>; }
export interface CollectionSpec { name: CollectionName; table: string; unique: UniqueSpec[]; index: string[]; }

export class StoreConflictError extends Error {
  constructor(message: string) { super(message); this.name = 'StoreConflictError'; }
}
