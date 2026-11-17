'use client';
import { LocationChip } from '@/features/profile/components/location-chip';
import { SocialLinksDialog, SocialLinksRow } from '@/features/profile/components/social-links';
import { useDialogs } from '@/shared/components/dialogs';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/shared/components/icon';
import { useTimeZone } from '@/shared/hooks/use-time-zone';
import { formatInZone } from '@/shared/time';
import { ITEM_LABELS } from '../service/public-view';
import type { SellerProfile } from '../service/seller-profile';
import { api, message } from '../service/market-client';
import { ListingCard } from './listing-card';
import { ListingDetail } from './listing-detail';
import { UserLink } from './user-link';
import { Avatar } from '@/features/profile/components/avatar';
import { AvatarEditor } from '@/features/profile/components/avatar-editor';
import { PostsFeed } from '@/features/profile/components/posts-feed';
import { FollowButton } from '@/features/profile/components/follow-button';
import { CommunityAccountHeader } from '@/shared/components/community-account-header';

import { BirdGlyph, glyphForItem } from '@/shared/components/glyph';
type Tab = 'novedades' | 'venta' | 'vendidos' | 'opiniones';

function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return <span className="stars" role="img" aria-label={`${String(value).replace('.', ',')} de 5`}>{[1, 2, 3, 4, 5].map(n => <i key={n} className={n <= full ? 'on' : ''}><Icon name="star" size={16}/></i>)}</span>;
}

// Perfil público del vendedor: visible sin sesión. Solo muestra la proyección aprobada del servidor.
export function SellerProfileView({ id }: { id: string }) {
  const [profile, setProfile] = useState<SellerProfile | null>(null), [error, setError] = useState(''), [tab, setTab] = useState<Tab>('novedades');
  const [viewer, setViewer] = useState<{ id: string; name: string; avatarUrl?: string | null } | null>(null), [avatarUrl, setAvatarUrl] = useState<string | null | undefined>(undefined), [focusPost, setFocusPost] = useState<string | undefined>();
  const [openId, setOpenId] = useState<string | null>(null), [more, setMore] = useState(false), [note, setNote] = useState(''), [editingLinks, setEditingLinks] = useState(false);
  const zone = useTimeZone();
  const dialogs = useDialogs();

  const load = useCallback(async (offset = 0) => {
    try {
      const data = await api<SellerProfile>(`/api/market/sellers/${encodeURIComponent(id)}${offset ? `?reviewsOffset=${offset}` : ''}`);
      setProfile(current => (offset && current ? { ...data, reviews: [...current.reviews, ...data.reviews] } : data));
      setError('');
    } catch (e) { setError(message(e, 'No se pudo cargar el perfil.')); }
  }, [id]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  // Enlace de una notificación: ?post=<id> destaca esa publicación del muro.
  useEffect(() => { const timer = window.setTimeout(() => { const wanted = new URLSearchParams(window.location.search).get('post'); if (wanted) setFocusPost(wanted); }, 0); return () => window.clearTimeout(timer); }, []);
  // Quién mira: el dueño del perfil ve el compositor y puede cambiar su foto. Sin sesión el perfil sigue siendo público.
  useEffect(() => { let active = true; fetch('/api/auth', { credentials: 'same-origin', cache: 'no-store' }).then(r => r.json()).then(b => { if (active) setViewer(b.user ? { id: b.user.id, name: b.user.displayName || b.user.email, avatarUrl: b.user.avatarUrl ?? null } : null); }).catch(() => undefined); return () => { active = false; }; }, []);

  async function loadMore() { if (!profile) return; setMore(true); await load(profile.reviews.length); setMore(false); }
  async function report() {
    const reason = await dialogs.ask({ title: `Denunciar a ${profile?.alias ?? 'este vendedor'}`, message: 'Un moderador lo revisará.', label: 'Motivo', multiline: true, minLength: 10, maxLength: 500, confirmLabel: 'Enviar denuncia' });
    if (reason === null) return;
    try { await api('/api/market/reports', { method: 'POST', body: { targetType: 'user', targetId: id, reason } }); setNote('Denuncia enviada. Un moderador la revisará.'); }
    catch (e) { setNote(message(e, 'No se pudo enviar la denuncia. Inicia sesión e inténtalo de nuevo.')); }
  }

  const rep = profile?.reputation, isOwner = Boolean(viewer && profile && viewer.id === profile.sellerId), photo = avatarUrl === undefined ? profile?.avatarUrl : avatarUrl;
  const max = rep ? Math.max(1, ...rep.distribution) : 1;
  return (
    <div>
      <CommunityAccountHeader />
      <div className="market-public-body seller-profile">
        {error && <div className="form-error" role="alert"><Icon name="alert" size={16} />{error === 'Criador no encontrado.' ? 'Este criador no existe.' : error}</div>}
        {!profile && !error && <div className="loading-state"><span className="spinner" />Cargando perfil…</div>}
        {profile && rep && (
          <>
            {editingLinks && <SocialLinksDialog links={profile.links} onClose={() => setEditingLinks(false)} onSaved={links => setProfile(current => current ? { ...current, links } : current)} />}
            <section className="panel seller-head">
              {isOwner ? <AvatarEditor name={profile.alias} url={photo} size={96} onChange={setAvatarUrl} /> : <Avatar url={photo} name={profile.alias} size={96} />}
              <div className="seller-head-info">
                <h1>{profile.alias}</h1>
                {profile.isDemo && <span className="demo-profile-badge">PERFIL DE MUESTRA · SIN OPERACIONES REALES</span>}
                {profile.location && <span className="market-meta seller-location"><Icon name="pin" size={13} /> {profile.location.city}{profile.location.region && profile.location.region !== profile.location.city ? `, ${profile.location.region}` : ''}</span>}
                {isOwner && <LocationChip onChanged={() => void load()} />}
                <span className="market-meta">Miembro desde {formatInZone(profile.memberSince, zone, true)}</span>
                <div className="seller-social-stats" aria-label="Estadísticas del perfil">
                  <span><strong>{profile.social.publications}</strong><small>publicaciones</small></span>
                  <span><strong>{profile.social.followers}</strong><small>seguidores</small></span>
                  <span><strong>{profile.social.following}</strong><small>seguidos</small></span>
                </div>
                {!profile.isDemo && <SocialLinksRow links={profile.links} owner={isOwner} onEdit={() => setEditingLinks(true)} />}
                {viewer && !isOwner && !profile.isDemo && <FollowButton targetId={profile.sellerId} viewerId={viewer.id} initialFollowing={profile.social.isFollowing} onFollowersChange={count => setProfile(current => current ? { ...current, social: { ...current.social, followers: count } } : current)} />}
                <div className="seller-score"><Stars value={rep.average} /><strong>{rep.count ? String(rep.average).replace('.', ',') : 'Sin valoraciones'}</strong><span className="market-meta">{profile.isDemo ? 'Sin opiniones ni ventas reales' : `${rep.count} ${rep.count === 1 ? 'opinión' : 'opiniones'} · ${rep.completedSales} ${rep.completedSales === 1 ? 'venta completada' : 'ventas completadas'}`}</span></div>
              </div>
              <div className="seller-bars" aria-label="Distribución de valoraciones">
                {[5, 4, 3, 2, 1].map(stars => (
                  <div key={stars}><span>{stars} <Icon name="star" size={12}/></span><div className="seller-bar"><i style={{ width: `${(rep.distribution[stars - 1] / max) * 100}%` }} /></div><small>{rep.distribution[stars - 1]}</small></div>
                ))}
              </div>
            </section>
            <p className="form-hint"><Icon name="alert" size={15} /> {profile.isDemo ? 'Esta cuenta ficticia muestra cómo se ve un perfil. No tiene animales, ventas, opiniones ni seguidores reales.' : 'Reputación basada en operaciones completadas en Pico Criollo. Los datos de los animales los declara cada vendedor.'}</p>
            <div className="market-tabs" role="tablist">
              {([['novedades', 'Novedades'], ['venta', `En venta (${profile.active.length})`], ['vendidos', `Vendidos (${rep.completedSales})`], ['opiniones', `Opiniones (${profile.reviewsTotal})`]] as [Tab, string][]).map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'selected' : ''} onClick={() => setTab(key)}>{label}</button>)}
            </div>

            {tab === 'novedades' && <PostsFeed userId={profile.sellerId} owner={isOwner} viewer={viewer ? { ...viewer, avatarUrl: isOwner ? photo : viewer.avatarUrl } : null} ownerName={profile.alias} ownerAvatarUrl={photo} focusPostId={focusPost} />}

            {tab === 'venta' && (profile.active.length === 0
              ? <div className="empty-state"><div className="empty-icon"><Icon name="store" size={26} /></div><h3>No tiene publicaciones activas</h3><p>Vuelve más tarde o explora el mercado.</p></div>
              : <div className="market-grid">{profile.active.map(item => <ListingCard key={item.id} listing={item} onOpen={() => setOpenId(item.id)} />)}</div>)}

            {tab === 'vendidos' && (profile.sold.length === 0
              ? <div className="empty-state"><div className="empty-icon"><Icon name="tag" size={26} /></div><h3>Aún no hay ventas completadas</h3></div>
              : <>
                  <p className="market-meta">Los precios y compradores de ventas pasadas no se publican.</p>
                  <ul className="sold-list">{profile.sold.map((row, index) => (
                    <li key={index} className="panel">
                      <span className="market-thumb market-thumb-small">{row.photoUrl ? <Image src={row.photoUrl} alt="" width={64} height={64} unoptimized className="market-thumb-img" /> : <span className="market-thumb-fallback" aria-hidden="true"><BirdGlyph kind={glyphForItem(row.itemType)} /></span>}</span>
                      <div><strong>{row.title}</strong><span className="market-meta">{ITEM_LABELS[row.itemType]}{row.quantity > 1 ? ` · ${row.quantity} unidades` : ''}</span><span className="market-meta market-meta-soft">Vendido el {formatInZone(row.soldAt, zone, true)}</span></div>
                    </li>
                  ))}</ul>
                </>)}

            {tab === 'opiniones' && (profile.reviews.length === 0
              ? <div className="empty-state"><div className="empty-icon"><Icon name="list" size={26} /></div><h3>Aún no hay opiniones publicadas</h3><p>Una opinión se publica cuando ambas partes valoraron o vence el plazo de 14 días.</p></div>
              : <>
                  <ul className="review-list">{profile.reviews.map((row, index) => (
                    <li key={index} className="panel">
                      <div className="review-head"><Stars value={row.stars} /><strong><UserLink id={row.raterId} name={row.raterAlias} newTab={false} /></strong><span className="status-pill pill-good">Compra completada</span></div>
                      {row.comment && <p>«{row.comment}»</p>}
                      <small>{formatInZone(row.createdAt, zone, true)} · {row.itemTitle}</small>
                    </li>
                  ))}</ul>
                  {profile.reviews.length < profile.reviewsTotal && <button className="btn-secondary" disabled={more} onClick={() => void loadMore()}>{more ? 'Cargando…' : 'Ver más opiniones'}</button>}
                </>)}

            <div className="dialog-actions"><button className="btn-secondary" onClick={() => void report()}>Denunciar al vendedor</button></div>
            {note && <p className="market-owner-note" role="status">{note}</p>}
          </>
        )}
      </div>
      {openId && <ListingDetail id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
