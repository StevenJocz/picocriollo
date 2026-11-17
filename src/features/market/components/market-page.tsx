'use client';
import { LocationChip } from '@/features/profile/components/location-chip';
import { BREEDS_BY_SPECIES, SPECIES, SPECIES_LABELS, type Species } from '@/models/species';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/shared/components/icon';
import type { PublicListing } from '../service/public-view';
import type { DemoMarketListing } from '../service/demo-listings';
import { api, message } from '../service/market-client';
import { ListingCard } from './listing-card';
import { ListingDetail } from './listing-detail';

const ALL_BREEDS = [...new Set(SPECIES.flatMap(species => BREEDS_BY_SPECIES[species]))].filter(name => name !== 'Otra').concat('Otra');
const SUPPLY_CATEGORIES = ['Alimento', 'Equipos', 'Incubación'];

export function MarketPage({ initialId, onNotice }: { initialId?: string; onNotice?: (text: string) => void }) {
  const [q, setQ] = useState(''), [species, setSpecies] = useState(''), [breed, setBreed] = useState(''), [sex, setSex] = useState(''), [kind, setKind] = useState(''), [type, setType] = useState('');
  const [min, setMin] = useState(''), [max, setMax] = useState(''), [locationVersion, setLocationVersion] = useState(0);
  const [items, setItems] = useState<PublicListing[]>([]), [demoListings, setDemoListings] = useState<DemoMarketListing[]>([]), [total, setTotal] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(initialId ?? null), [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = [type, species, breed, sex, kind, min, max].filter(Boolean).length;
  const breeds = species ? BREEDS_BY_SPECIES[species as Species] ?? [] : ALL_BREEDS;

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      for (const [key, value] of [['type', type], ['species', species], ['breed', breed], ['sex', sex], ['kind', kind], ['min', min], ['max', max]]) if (value) params.set(key, value);
      try {
        const result = await api<{ items: PublicListing[]; total: number; demoListings?: DemoMarketListing[] }>(`/api/market?${params}`);
        if (!active) return;
        setItems(result.items); setTotal(result.total); setDemoListings(result.demoListings ?? []); setError('');
      } catch (e) { if (active) setError(message(e, 'No se pudo cargar el mercado.')); }
      finally { if (active) setLoading(false); }
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [q, type, species, breed, sex, kind, min, max, locationVersion]);

  return (
    <div className="module-view market-view">
      <div className="module-title-row">
        <div>
          <div className="breadcrumb"><span>Mercado</span><Icon name="arrow" size={13} /><strong>Mercado Avícola</strong></div>
          <h1>Mercado Avícola</h1>
          <p>Aves, pollitos y huevos publicados por criadores de Pico Criollo. Los datos los declara cada vendedor.</p>
        </div>
      </div>
      <LocationChip className="market-location" onChanged={() => setLocationVersion(version => version + 1)} />
      <section className="panel market-filters">
        <div className="search-box"><Icon name="search" size={17} /><input aria-label="Buscar aves" placeholder="Buscar por nombre, raza o código…" value={q} onChange={e => setQ(e.target.value)} /></div>
        <button type="button" className="filters-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(open => !open)}><Icon name="list" size={16} />Filtros{activeFilters > 0 && <i>{activeFilters}</i>}</button>
        <div className="market-filters-more" data-open={filtersOpen}>
          <select aria-label="Qué se vende" value={type} onChange={e => setType(e.target.value)}><option value="">Aves y lotes</option><option value="ave">Aves individuales</option><option value="lote_aves">Lotes de aves</option><option value="lote_pollitos">Lotes de pollitos</option><option value="lote_huevos">Lotes de huevos</option><option value="insumo">Insumos (cuido, maíz, equipos)</option></select>
        <select aria-label="Tipo de ave" value={species} onChange={e => { setSpecies(e.target.value); setBreed(''); }}><option value="">Todas las aves</option>{SPECIES.map(item => <option key={item} value={item}>{SPECIES_LABELS[item]}</option>)}</select>
        <select aria-label="Raza" value={breed} onChange={e => setBreed(e.target.value)}><option value="">Todas las razas</option><optgroup label="Razas">{breeds.map(b => <option key={b}>{b}</option>)}</optgroup><optgroup label="Insumos">{SUPPLY_CATEGORIES.map(b => <option key={b}>{b}</option>)}</optgroup></select>
        <select aria-label="Sexo" value={sex} onChange={e => setSex(e.target.value)}><option value="">Hembras, machos y crías</option><option value="Gallina">Hembras</option><option value="Gallo">Machos</option><option value="Pollito">Crías</option></select>
        <select aria-label="Tipo de publicación" value={kind} onChange={e => setKind(e.target.value)}><option value="">Todos los tipos</option><option value="fixed">Precio fijo</option><option value="interest">Publicación de interés</option></select>
        <input aria-label="Precio mínimo" type="number" min={0} placeholder="Precio mín." value={min} onChange={e => setMin(e.target.value)} />
        <input aria-label="Precio máximo" type="number" min={0} placeholder="Precio máx." value={max} onChange={e => setMax(e.target.value)} />
        </div>
      </section>
      {error && <div className="form-error" role="alert"><Icon name="alert" size={16} />{error}</div>}
      {loading ? <div className="loading-state"><span className="spinner" />Cargando aves…</div>
        : items.length === 0 && demoListings.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><Icon name="store" size={26} /></div><h3>No hay publicaciones con esos criterios</h3><p>Prueba quitando filtros, o publica desde «Mis publicaciones».</p></div>
        ) : items.length > 0 ? (
          <>
            <p className="market-count">{total} {total === 1 ? 'publicación' : 'publicaciones'}</p>
            <div className="market-grid">{items.map(item => <ListingCard key={item.id} listing={item} onOpen={() => setOpenId(item.id)} />)}</div>
          </>
        ) : null}
      {!loading && demoListings.length > 0 && <section className="demo-market-section" aria-label="Publicaciones de muestra">
        <div className="demo-market-heading"><div><span>VITRINA DE EJEMPLO</span><h2>Así se ve el mercado</h2><p>Fotos, nombres y valores ilustrativos. No son ofertas ni se pueden comprar.</p></div><span className="demo-profile-badge">MUESTRA · NO DISPONIBLE</span></div>
        <div className="market-grid">{demoListings.map(item => <DemoMarketCard key={item.id} listing={item} />)}</div>
      </section>}
      {openId && <ListingDetail id={openId} onClose={() => setOpenId(null)} onNotice={onNotice} />}
    </div>
  );
}

function DemoMarketCard({ listing }: { listing: DemoMarketListing }) {
  return <article className="market-card demo-market-card">
    <div className="market-card-main demo-market-card-main">
      <div className="market-thumb"><Image src={listing.imageUrl} alt={`Imagen ilustrativa de ${listing.title}`} width={160} height={120} unoptimized className="market-thumb-img" /></div>
      <div className="market-card-body">
        <div className="market-card-head"><strong>{listing.title}</strong><span className="demo-profile-badge">MUESTRA</span></div>
        <span className="market-meta"><span className="market-type-badge">{listing.itemType}</span>{listing.breed}</span>
        <strong className="demo-price-label">{listing.examplePrice}</strong>
        <p className="market-excerpt">{listing.description}</p>
        <span className="demo-market-disabled">No disponible para compra</span>
      </div>
    </div>
    <Link className="market-card-seller" href={`/mercado/vendedor/${encodeURIComponent(listing.sellerId)}`}><Icon name="user" size={13} /> {listing.sellerAlias}</Link>
  </article>;
}
