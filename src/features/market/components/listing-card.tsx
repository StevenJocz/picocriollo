'use client';
import { SPECIES_LABELS, sexLabel, speciesOf } from '@/models/species';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/shared/components/icon';
import { remaining } from '@/shared/time';
import { ITEM_LABELS, KIND_LABELS, type PublicListing } from '../service/public-view';
import { money } from '../service/market-client';

import { BirdGlyph, glyphForItem } from '@/shared/components/glyph';
export function BirdThumb({ listing, size = 96 }: { listing: Pick<PublicListing, 'snapshot'>; size?: number }) {
  const s = listing.snapshot;
  const glyph = glyphForItem(s.itemType, s.sex);
  return s.photoUrl
    ? <Image src={s.photoUrl} alt={`Foto de ${s.title ?? s.name}`} width={size} height={size} unoptimized className="market-thumb-img" />
    : <span className="market-thumb-fallback" aria-hidden="true"><BirdGlyph kind={glyph} /></span>;
}

export function PriceLabel({ listing }: { listing: PublicListing }): ReactNode {
  if (listing.auction) {
    return (
      <span className="market-price-block">
        <span className="market-price">{money(listing.auction.currentPrice)}</span>
        <small>{listing.auction.bidCount ? `Oferta actual · ${listing.auction.bidCount} ${listing.auction.bidCount === 1 ? 'oferta' : 'ofertas'}` : 'Precio inicial · sin ofertas'}</small>
      </span>
    );
  }
  if (listing.kind === 'interest') return <span className="market-price market-price-soft">Consultar al vendedor</span>;
  return <span className="market-price">{money(listing.price)}</span>;
}

export function ListingCard({ listing, onOpen }: { listing: PublicListing; onOpen: () => void }) {
  const s = listing.snapshot;
  const title = s.title ?? s.name, type = s.itemType ?? 'ave', photos = s.photoUrls?.length ?? 0;
  return (
    <article className="market-card">
      <button className="market-card-main" onClick={onOpen} aria-label={`Ver ${title}`}>
        <div className="market-thumb">
          <BirdThumb listing={listing} />
          {photos > 1 && <span className="market-photo-count" aria-label={`${photos} fotos`}>{photos} fotos</span>}
        </div>
        <div className="market-card-body">
          <div className="market-card-head">
            <strong>{title}</strong>
            <span className="status-pill pill-neutral"><Icon name={listing.kind === 'auction' ? 'gavel' : 'tag'} size={11} /> {KIND_LABELS[listing.kind]}</span>
          </div>
          <span className="market-meta"><span className="market-type-badge">{ITEM_LABELS[type]}</span>{s.species && s.species !== 'Gallinas' ? `${SPECIES_LABELS[speciesOf(s.species)]} · ` : ''}{s.breed || 'Raza no indicada'}{type === 'ave' ? ` · ${sexLabel(s.sex, s.species)}` : ''}{s.ageLabel ? ` · ${s.ageLabel}` : ''}</span>
          {(s.code || s.ring) && <span className="market-meta">{s.code}{s.ring ? ` · Anillo ${s.ring}` : ''}</span>}
          <PriceLabel listing={listing} />
          {s.description && <p className="market-excerpt">{s.description}</p>}
          {listing.auction && listing.closesAt && listing.auction.phase === 'abierta' && <span className="status-pill pill-good">Cierra en {remaining(listing.closesAt)}</span>}
          {listing.auction?.phase === 'programada' && <span className="status-pill pill-neutral">Subasta programada</span>}
          <span className="market-meta market-meta-soft">{listing.sellerReputation?.count ? `★ ${listing.sellerReputation.average} · ` : ''}{s.deliveryZone || 'Zona no indicada'}</span>
        </div>
      </button>
      <Link className="market-card-seller" href={`/mercado/vendedor/${listing.sellerId}`}><Icon name="user" size={13} /> {listing.sellerAlias}</Link>
    </article>
  );
}
