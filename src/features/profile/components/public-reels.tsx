'use client';

import { flushSignals, queueSignal, seenKey, serverKey } from '../service/reel-signals-client';
import { LocationChip } from './location-chip';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { ReelFeedItem, ReelFeedPage } from '../service/posts';
import { Avatar } from './avatar';
import { ShareDialog, type ShareTarget } from './share-dialog';
import { CommentsSheet } from './comments-sheet';
import type { Viewer } from './comments-section';
import { FollowButton } from './follow-button';
import { api, message, money } from '@/features/market/service/market-client';
import { useDialogs } from '@/shared/components/dialogs';
import { CommunityAccountHeader } from '@/shared/components/community-account-header';

import { BirdGlyph, glyphForItem } from '@/shared/components/glyph';
import { Icon, IconBadge } from '@/shared/components/icon';
import { VideoEmbed } from '@/shared/components/video-embed';
import { useSingleVideoPlayback } from '@/shared/hooks/use-single-video';
import { DWELL_MS, pickActiveReel } from '../service/reel-playback';
const SUGGESTIONS = ['Gallinas', 'Gallos', 'Pollitos', 'Huevos', 'Criolla', 'Brahma', 'Cubana', 'Ponedora', 'Subasta', 'Precio fijo', 'Mercado'];

export function PublicReels({ initialTag = '', initialQuery = '' }: { initialTag?: string; initialQuery?: string }) {
  const [items, setItems] = useState<ReelFeedItem[]>([]);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const openShare = useCallback((target: ShareTarget) => setShareTarget(target), []);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const viewerId = viewer?.id ?? '';
  const tag = initialTag.replace(/^#/, '').trim().slice(0, 50);
  const [next, setNext] = useState<string>();
  // «Para ti»: la semilla cambia en cada visita (para que no sea siempre igual) y se informa lo ya visto para no repetir.
  const seedRef = useRef(''), itemsRef = useRef<ReelFeedItem[]>([]);
  useEffect(() => { itemsRef.current = items; }, [items]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const sentinel = useRef<HTMLDivElement>(null);
  const streamRef = useRef<HTMLElement>(null);
  const loadingMore = useRef(false);
  const requestId = useRef(0);
  // «query» es lo que se escribe; «search» es lo aplicado (con 300 ms de espera para no consultar en cada tecla).
  const [query, setQuery] = useState(initialQuery.slice(0, 80)), [search, setSearch] = useState(initialQuery.trim().slice(0, 80)), [focused, setFocused] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => setSearch(query.trim()), 300); return () => window.clearTimeout(timer); }, [query]);
  // Reproducción automática: solo el reel que se está mirando (≥ 60 % visible) se reproduce; los demás se pausan o se descargan.
  const [activeKey, setActiveKey] = useState(''), [soundOn, setSoundOn] = useState(false);
  const ratios = useRef(new Map<string, number>());
  const pendingKey = useRef(''), dwellTimer = useRef(0);
  const toggleSound = useCallback(() => setSoundOn(on => !on), []);
  // Al cambiar de reel el anterior se detiene de inmediato, pero el nuevo solo arranca tras una breve pausa (DWELL_MS):
  // pasar rápido por varios reels no crea reproductores ni descarga videos que nadie va a ver.
  const settle = useCallback((next: string) => {
    if (next === pendingKey.current) return;
    pendingKey.current = next;
    window.clearTimeout(dwellTimer.current);
    setActiveKey(current => (current === next ? current : ''));
    if (next) dwellTimer.current = window.setTimeout(() => setActiveKey(next), DWELL_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(dwellTimer.current), []);
  // Aprendizaje de gustos: cuánto tiempo estuvo cada reel a la vista (el servidor lo usa para ordenar «Para ti»).
  const viewRef = useRef<{ key: string; start: number } | null>(null);
  const closeView = useCallback(() => {
    const current = viewRef.current;
    if (!current) return;
    viewRef.current = null;
    const key = serverKey(current.key), ms = Math.round(performance.now() - current.start);
    if (key && ms >= 200) queueSignal({ key, type: 'view', ms });
  }, []);
  useEffect(() => {
    closeView();
    if (activeKey) viewRef.current = { key: activeKey, start: performance.now() };
  }, [activeKey, closeView]);
  useEffect(() => {
    const timer = window.setInterval(() => flushSignals(), 8000);
    const leave = () => { closeView(); flushSignals({ beacon: true }); };
    const onHide = () => { if (document.visibilityState === 'hidden') leave(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', leave);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', leave); leave(); };
  }, [closeView]);
  useSingleVideoPlayback();
  useEffect(() => {
    const url = new URL(window.location.href);
    if (search) url.searchParams.set('q', search); else url.searchParams.delete('q');
    window.history.replaceState(null, '', url);
  }, [search]);

  const load = useCallback(async (before?: string) => {
    if (before && loadingMore.current) return;
    const id = ++requestId.current;
    if (before) loadingMore.current = true; else setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '10' });
      seedRef.current ||= Math.random().toString(36).slice(2, 10);
      params.set('seed', seedRef.current);
      if (before) { params.set('before', before); params.set('seen', itemsRef.current.slice(-150).map(item => seenKey(item.kind, item.id)).join(',')); }
      if (tag) params.set('tag', tag);
      if (search) params.set('q', search);
      const response = await fetch(`/api/reels?${params}`, { cache: 'no-store', credentials: 'same-origin' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'No se pudieron cargar las publicaciones.');
      if (id !== requestId.current) return;
      const page = body as ReelFeedPage;
      setItems(current => before ? [...current, ...page.items.filter(item => !current.some(row => row.kind === item.kind && row.id === item.id))] : page.items);
      setNext(page.nextBefore);
      setError('');
      if (!before) streamRef.current?.scrollTo({ top: 0 });
    } catch (cause) {
      if (id === requestId.current) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las publicaciones.');
    } finally {
      if (id === requestId.current) { loadingMore.current = false; setLoading(false); }
    }
  }, [tag, search]);

  useEffect(() => {
    let active = true;
    fetch('/api/auth', { cache: 'no-store', credentials: 'same-origin' }).then(r => r.json()).then(body => { if (active) setViewer(body.user ? { id: body.user.id, name: body.user.displayName || body.user.email, avatarUrl: body.user.avatarUrl ?? null } : null); }).catch(() => undefined);
    const timer = window.setTimeout(() => void load(), 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [load]);
  // Carga continua: el observador mira dentro del contenedor que hace scroll y se adelanta ~1400 px,
  // así la siguiente página ya está lista antes de que el usuario llegue al final.
  useEffect(() => {
    const target = sentinel.current, root = streamRef.current;
    if (!target || !root || !next) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void load(next);
    }, { root, rootMargin: '0px 0px 1400px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [load, next]);

  useEffect(() => {
    const root = streamRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) ratios.current.set(entry.target.getAttribute('data-reel-key') ?? '', entry.isIntersecting ? entry.intersectionRatio : 0);
      settle(document.visibilityState === 'hidden' ? '' : pickActiveReel(ratios.current));
    }, { root, threshold: [0, 0.25, 0.5, 0.6, 0.75, 0.9, 1] });
    root.querySelectorAll('[data-reel-key]').forEach(card => observer.observe(card));
    const onVisibility = () => settle(document.visibilityState === 'hidden' ? '' : pickActiveReel(ratios.current));
    document.addEventListener('visibilitychange', onVisibility);
    const seen = ratios.current;
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', onVisibility); seen.clear(); };
  }, [items, settle]);

  // Se precarga (solo metadatos) el video del reel activo y el siguiente; el resto no descarga nada hasta que les toque.
  const postKeys = items.filter(item => item.kind === 'post').map(item => `post:${item.id}`);
  const nextKey = postKeys[postKeys.indexOf(activeKey) + 1] ?? '';

  return (
    <main className="public-reels-page">
      <CommunityAccountHeader />
      <div className="reels-search-wrap">
        <form className="reels-search" role="search" onSubmit={event => { event.preventDefault(); setSearch(query.trim()); }}>
          <Icon name="search" size={18} />
          <input type="search" value={query} maxLength={80} placeholder="Buscar raza, tipo de ave, vendedor, #etiqueta…" aria-label="Buscar en reels y mercado" enterKeyHint="search" autoComplete="off"
            onChange={event => setQuery(event.target.value)} onFocus={() => setFocused(true)} onBlur={() => window.setTimeout(() => setFocused(false), 150)} />
          {query && <button type="button" className="reels-search-clear" aria-label="Borrar búsqueda" onClick={() => { setQuery(''); setSearch(''); }}><Icon name="close" size={16} /></button>}
        </form>
        <LocationChip className="reels-location" onChanged={() => void load()} />
        {(focused || query) && <div className="reels-search-chips" role="group" aria-label="Búsquedas sugeridas">
          {SUGGESTIONS.map(label => <button key={label} type="button" className={query.trim().toLowerCase() === label.toLowerCase() ? 'is-on' : ''}
            onMouseDown={event => event.preventDefault()} onClick={() => { const same = query.trim().toLowerCase() === label.toLowerCase(); setQuery(same ? '' : label); setSearch(same ? '' : label); }}>{label}</button>)}
        </div>}
      </div>
      <section className="reels-stream" ref={streamRef} aria-label="Reels y publicaciones del mercado de la comunidad">
        {search && !loading && items.length > 0 && <div className="reels-filter-note">Resultados para <strong>«{search}»</strong><button type="button" onClick={() => { setQuery(''); setSearch(''); }}>Borrar búsqueda</button></div>}
        {tag && <div className="reels-filter-note">Publicaciones con <strong>#{tag}</strong><Link href="/">Ver todos</Link></div>}
        {loading && <div className="reels-message">Cargando publicaciones…</div>}
        {!loading && items.length === 0 && (search
          ? <div className="reels-empty"><span><Icon name="search" size={30}/></span><h2>Sin resultados para «{search}»</h2><p>Prueba con otra raza, el tipo de ave (gallina, gallo, pollito, huevos) o el nombre del criador.</p><button type="button" className="reels-empty-action" onClick={() => { setQuery(''); setSearch(''); }}>Borrar búsqueda</button></div>
          : <div className="reels-empty"><span><Icon name="video" size={30}/></span><h2>{tag ? `Aún no hay reels con #${tag}` : 'La comunidad empieza aquí'}</h2><p>{tag ? 'Prueba otra etiqueta o vuelve al feed completo.' : 'Comparte novedades de tu criadero o publica tus productos en venta para que aparezcan aquí.'}</p></div>)}
        {items.map(item => item.kind === 'post'
          ? <ReelCard key={`post:${item.id}`} post={item.post} viewerId={viewerId} viewer={viewer} active={activeKey === `post:${item.id}`} preload={activeKey === `post:${item.id}` || nextKey === `post:${item.id}`} soundOn={soundOn} onToggleSound={toggleSound} onShare={openShare} />
          : item.kind === 'advertisement'
            ? <AdvertisementCard key={`ad:${item.id}`} item={item} viewerId={viewerId} onShare={openShare} />
            : <SampleAdvertisementCard key={`sample-ad:${item.id}`} item={item} />)}
        {error && <div className="reels-message" role="alert">{error}<button onClick={() => void load(next)}>Reintentar</button></div>}
        {next && <div ref={sentinel} className="reels-loading-more" role="status" aria-live="polite"><span className="spinner" />Cargando más publicaciones…</div>}
        {!loading && items.length > 0 && !next && <div className="reels-end">Ya viste todas las publicaciones disponibles.</div>}
      </section>
      {shareTarget && <ShareDialog target={shareTarget} signedIn={Boolean(viewerId)} onClose={() => setShareTarget(null)} />}
    </main>
  );
}

const ReelCard = memo(function ReelCard({ post, viewerId, viewer, active, preload, soundOn, onToggleSound, onShare }: { post: Extract<ReelFeedItem, { kind: 'post' }>['post']; viewerId: string; viewer: Viewer | null; active: boolean; preload: boolean; soundOn: boolean; onToggleSound: () => void; onShare: (target: ShareTarget) => void }) {
  // Un reel compartido se muestra con el contenido y el crédito del original; quien lo compartió aparece como «Compartido por».
  const src = post.shared?.available ? post.shared : undefined;
  const authorId = src?.authorId ?? post.authorId, authorAlias = src?.authorAlias ?? post.authorAlias, authorAvatarUrl = src ? src.authorAvatarUrl : post.authorAvatarUrl;
  const authorIsDemo = src ? Boolean(src.authorIsDemo) : post.authorIsDemo;
  const embed = src ? src.embed : post.embed, allMedia = src ? (src.media ?? []) : post.media, bodyText = src ? (src.text ?? '') : post.text;
  const media = allMedia[0];
  const dialogs = useDialogs();
  // «Me gusta» como corazón: botón y doble toque sobre el reel (el doble toque solo da me gusta, nunca lo quita).
  const [liked, setLiked] = useState(post.liked), [likes, setLikes] = useState(post.likes), [burst, setBurst] = useState(0), [comments, setComments] = useState(post.commentCount), [showComments, setShowComments] = useState(false);
  const likeBusy = useRef(false), lastTap = useRef(0), burstTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(burstTimer.current), []);
  const canLike = !post.authorIsDemo && Boolean(viewerId);
  async function setLike(target: boolean) {
    if (likeBusy.current || target === liked) return;
    likeBusy.current = true;
    setLiked(target); setLikes(count => Math.max(0, count + (target ? 1 : -1)));
    try { const result = await api<{ liked: boolean; likes: number }>(`/api/posts/${post.id}/like`, { method: 'POST', body: { liked: target } }); setLiked(result.liked); setLikes(result.likes); }
    catch (cause) { setLiked(!target); setLikes(count => Math.max(0, count + (target ? -1 : 1))); dialogs.notify(message(cause, 'No se pudo registrar tu me gusta.'), 'error'); }
    finally { likeBusy.current = false; }
  }
  function onCardClick(event: React.MouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest('a, input, textarea, button:not(.ve-tap), .reel-tools, .ve-open, .dialog-backdrop')) return;
    const now = Date.now();
    if (now - lastTap.current > 320) { lastTap.current = now; return; }
    lastTap.current = 0;
    setBurst(value => value + 1);
    window.clearTimeout(burstTimer.current);
    burstTimer.current = window.setTimeout(() => setBurst(0), 900);
    if (canLike && !liked) void setLike(true);
  }
  const video = media?.kind === 'video';
  const videoRef = useRef<HTMLVideoElement>(null);
  // Video subido: arranca solo cuando es el reel activo (sin sonido hasta que se active) y se pausa al salir.
  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    if (!active) { element.pause(); return; }
    element.muted = !soundOn;
    const attempt = element.play();
    if (attempt) attempt.catch(() => { element.muted = true; void element.play().catch(() => undefined); });
  }, [active, soundOn]);
  const hasSound = video || embed?.provider === 'youtube';
  const share = () => onShare({ id: src?.id ?? post.id, authorId, authorAlias, own: authorId === viewerId || post.authorId === viewerId, sample: authorIsDemo });
  return (
    <article className={`reel-card${embed ? ' has-embed' : ''}`} data-reel-key={`post:${post.id}`} onClick={onCardClick}>
      {embed ? <VideoEmbed embed={embed} fill active={active} soundOn={soundOn} /> : media ? video
        ? <video ref={videoRef} className="reel-media" src={media.url} poster={media.thumbUrl} controls playsInline loop muted preload={preload ? 'metadata' : 'none'} />
        : <Image className="reel-media" src={media.url} alt={`Publicación de ${authorAlias}`} fill unoptimized decoding="async" sizes="(max-width: 600px) 100vw, 520px" />
        : <div className="reel-text-art"><span><Icon name="feather" size={30}/></span><ReelTextBody text={bodyText} /></div>}
      <div className="reel-shade" />
      <div className="reel-content">
        {src && <span className="reel-shared-by"><Icon name="share" size={13} />Compartido por <Link href={`/mercado/vendedor/${encodeURIComponent(post.authorId)}`}>{post.authorAlias}</Link></span>}
        <div className="reel-author-row">
          <Link className="reel-author" href={`/mercado/vendedor/${encodeURIComponent(authorId)}`}>
            <Avatar url={authorAvatarUrl} name={authorAlias} size={44} />
            <span><strong>{authorAlias}</strong><small>{src ? 'Autor original · Ver perfil' : `${post.authorFollowers} seguidores · Ver perfil`}</small></span>
          </Link>
          {authorIsDemo ? <span className="reel-sample-pill">MUESTRA</span> : src ? null : <FollowButton targetId={post.authorId} viewerId={viewerId} initialFollowing={post.followedByViewer} compact />}
        </div>
        {authorIsDemo && <span className="reel-sample-note">Cuenta de muestra · imagen ilustrativa</span>}
        {src && post.text && <p className="reel-caption reel-share-note"><strong>{post.authorAlias}:</strong> <CaptionWithTags text={post.text}/></p>}
        {bodyText && (media || embed) && <p className="reel-caption"><CaptionWithTags text={bodyText}/></p>}
        <div className="reel-social">{allMedia.length > 1 && <span>+{allMedia.length - 1} archivos</span>}</div>
      </div>
      {burst > 0 && <span key={burst} className="reel-heart-burst" aria-hidden="true"><Icon name="heart" size={96} strokeWidth={1.4} /></span>}
      <div className="reel-tools">
        {!post.authorIsDemo && <div className="reel-like-wrap"><button type="button" className="reel-share reel-like" aria-pressed={liked} aria-label={liked ? 'Quitar me gusta' : 'Me gusta'} onClick={() => canLike ? void setLike(!liked) : dialogs.notify('Inicia sesión para dar me gusta.', 'error')}><Icon name="heart" size={20} /></button><small>{likes}</small></div>}
        {!post.authorIsDemo && <div className="reel-like-wrap"><button type="button" className="reel-share reel-comment" aria-label={`Ver comentarios (${comments})`} onClick={() => setShowComments(true)}><Icon name="chat" size={20} /></button><small>{comments}</small></div>}
        {hasSound && <button type="button" className="reel-sound" aria-pressed={soundOn} aria-label={soundOn ? 'Silenciar los videos' : 'Activar el sonido de los videos'} onClick={onToggleSound}><Icon name={soundOn ? 'volume' : 'mute'} size={18} /></button>}
        <button type="button" className="reel-share" aria-label="Compartir este reel" onClick={share}><Icon name="share" size={18} /></button>
      </div>
      {showComments && <CommentsSheet postId={post.id} count={comments} viewer={viewer} onCountChange={delta => setComments(count => Math.max(0, count + delta))} onClose={() => setShowComments(false)} />}
      {video && <span className="reel-video-label">VIDEO</span>}
      {embed && <span className="reel-video-label reel-embed-label"><Icon name="play" size={13} />{embed.label.toUpperCase()}</span>}
    </article>
  );
});

function SampleAdvertisementCard({ item }: { item: Extract<ReelFeedItem, { kind: 'sample-advertisement' }> }) {
  const listing = item.listing;
  return (
    <article className="reel-card reel-ad-card">
      <Image className="reel-media" src={listing.imageUrl} alt={`Imagen ilustrativa: ${listing.title}`} fill unoptimized sizes="(max-width: 600px) 100vw, 520px" />
      <div className="reel-shade" />
      <span className="reel-ad-label reel-market-label"><IconBadge name="store" tone="gold" size={26} glyph={15} />MERCADO · MUESTRA</span>
      <div className="reel-content">
        <div className="reel-author-row">
          <Link className="reel-author" href={`/mercado/vendedor/${encodeURIComponent(listing.sellerId)}`}>
            <Avatar name={listing.sellerAlias} size={44} />
            <span><strong>{listing.sellerAlias}</strong><small>Perfil de demostración</small></span>
          </Link>
        </div>
        <div className="reel-ad-copy"><strong>{listing.title}</strong><span>{listing.examplePrice}</span><small>{listing.itemType} · {listing.breed}</small><p>{listing.description}</p></div>
        <span className="reel-sample-unavailable">Ejemplo visual · no disponible para compra</span>
      </div>
    </article>
  );
}

function AdvertisementCard({ item, viewerId, onShare }: { item: Extract<ReelFeedItem, { kind: 'advertisement' }>; viewerId: string; onShare: (target: ShareTarget) => void }) {
  const listing = item.listing, snapshot = listing.snapshot, photo = snapshot.photoUrl;
  const title = snapshot.title ?? snapshot.name;
  const glyph = glyphForItem(snapshot.itemType);
  const price = listing.kind === 'interest' ? 'Consultar al vendedor' : listing.auction ? `Subasta · ${money(listing.auction.currentPrice)}` : money(listing.price);
  return (
    <article className="reel-card reel-ad-card" data-reel-key={`ad:${item.id}`}>
      {photo ? <Image className="reel-media" src={photo} alt={title} fill unoptimized sizes="(max-width: 600px) 100vw, 520px" /> : <div className="reel-ad-art"><span><BirdGlyph kind={glyph} size={72} /></span><strong>{title}</strong></div>}
      <div className="reel-shade" />
      <span className="reel-ad-label reel-market-label"><IconBadge name="store" tone="gold" size={26} glyph={15} />MERCADO</span>
      <div className="reel-tools"><button type="button" className="reel-share" aria-label="Compartir este aviso" onClick={() => onShare({ id: listing.id, authorId: listing.sellerId, authorAlias: listing.sellerAlias, own: listing.sellerId === viewerId, href: `/mercado/${encodeURIComponent(listing.id)}` })}><Icon name="share" size={18} /></button></div>
      <div className="reel-content">
        <div className="reel-author-row">
          <Link className="reel-author" href={`/mercado/vendedor/${encodeURIComponent(listing.sellerId)}`}>
            <Avatar url={item.sellerAvatarUrl} name={listing.sellerAlias} size={44} />
            <span><strong>{listing.sellerAlias}</strong><small>{item.sellerFollowers} seguidores · Publicación del mercado</small></span>
          </Link>
          <FollowButton targetId={listing.sellerId} viewerId={viewerId} initialFollowing={item.followedByViewer} compact />
        </div>
        <div className="reel-ad-copy"><strong>{title}</strong><span>{price}</span><small>{snapshot.breed || 'Criadero Pico Criollo'}{snapshot.deliveryZone ? ` · ${snapshot.deliveryZone}` : ''}</small>{snapshot.description && <p>{snapshot.description}</p>}</div>
        <Link className="reel-ad-cta" href={`/mercado/${encodeURIComponent(listing.id)}`} onClick={() => { queueSignal({ key: `a:${item.id}`, type: 'open' }); flushSignals({ beacon: true }); }}>Ver en el mercado <Icon name="arrow" size={16} /></Link>
      </div>
    </article>
  );
}

/** Texto de un reel sin foto ni video: se muestra recortado y, si no cabe, «Ver más» lo despliega (con desplazamiento propio). */
function ReelTextBody({ text }: { text: string }) {
  const [open, setOpen] = useState(false), [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => { if (!element.classList.contains('is-open')) setOverflowing(element.scrollHeight > element.clientHeight + 1); };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);
  return (
    <div className="reel-text-body">
      <p ref={ref} className={open ? 'is-open' : ''} data-size={text.length <= 180 ? 's' : text.length <= 360 ? 'm' : text.length <= 700 ? 'l' : 'xl'}><CaptionWithTags text={text} /></p>
      {(overflowing || open) && <button type="button" className="reel-more" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Ver menos' : 'Ver más'}</button>}
    </div>
  );
}

function CaptionWithTags({ text }: { text: string }) {
  return <>{text.split(/(#[\p{L}\p{N}_]+)/gu).map((part, index) => part.startsWith('#') && /^#[\p{L}\p{N}_]+$/u.test(part)
    ? <Link className="reel-hashtag" key={`${part}-${index}`} href={`/?tag=${encodeURIComponent(part.slice(1))}`}>{part}</Link>
    : part)}</>;
}
