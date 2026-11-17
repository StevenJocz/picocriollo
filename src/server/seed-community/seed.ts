import { randomUUID } from 'node:crypto';
import { normalizeFarmData } from '../../features/farm/service/farm.service.ts';
import { applyFarmSave } from '../../features/market/service/farm-guard.ts';
import { createListing } from '../../features/market/service/listings.ts';
import type { Ctx, Deps, ListingInput } from '../../features/market/service/listings.ts';
import { createPost } from '../../features/profile/service/posts.ts';
import { setAvatar, uploadMedia } from '../../features/profile/service/media.ts';
import type { FarmRecord, Store, UserRecord } from '../storage/types.ts';
import { emptyFarmData } from '../farm-template.ts';
import {
  BREED_PHOTOS, seedSocialLinks, CHICK_NAMES, COMMENT_POOL, EGG_PHOTOS, HEALTH_NOTES, HEN_NAMES, LISTING_NOTES, PROFILES, REPLY_POOL, ROOSTER_NAMES, SEED_EMAIL_DOMAIN, STATUS_HEN, SUPPLIES,
  between, buildPostPlans, pick, rng, seedEmail, shuffled, type SeedProfile, type SupplyDef,
} from './profiles.ts';

const DAY = 86_400_000, HOUR = 3_600_000;

export interface SeedImage { bytes: Uint8Array; width: number; height: number; }
export interface SeedAssets {
  /** Nombre de archivo de `public/seed` (por ejemplo `raza-brahma-gallo.jpg`). */
  image(name: string): SeedImage;
  has(name: string): boolean;
}
export interface SeedReport { users: number; skipped: number; posts: number; listings: number; listingsByType: Record<string, number>; likes: number; comments: number; follows: number; }

const dateOnly = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dataUrl = (image: SeedImage) => `data:image/jpeg;base64,${Buffer.from(image.bytes).toString('base64')}`;
const round = (value: number, step: number) => Math.round(value / step) * step;

type Json = Record<string, unknown>;
interface FarmBird { id: string; name: string; sex: 'Gallina' | 'Gallo' | 'Pollito'; breed: string; status: string; photo: string; }

/** Foto grande (publicaciones) y chica (avisos) de un archivo de `public/seed`. */
const photoFile = (name: string) => `${name}.jpg`;
const smallFile = (assets: SeedAssets, name: string) => (assets.has(`${name}-s.jpg`) ? `${name}-s.jpg` : photoFile(name));

function buildFarm(profile: SeedProfile, index: number, now: number) {
  const random = rng(7919 * (index + 3));
  const coops = profile.coops.map((coop, i) => ({
    id: `coop-${i + 1}`, name: coop.name, location: coop.location, capacity: between(random, 14, 60), type: coop.type, status: 'Activo',
    startedAt: dateOnly(now - between(random, 120, 900) * DAY), notes: i === 0 ? 'Gallinero principal, buena ventilación.' : '',
  }));
  const adultCoops = coops.filter(coop => coop.type !== 'Cría'), chickCoop = coops.find(coop => coop.type === 'Cría') ?? coops[0];
  const henNames = shuffled(random, HEN_NAMES), roosterNames = shuffled(random, ROOSTER_NAMES), chickNames = shuffled(random, CHICK_NAMES);
  const birds: FarmBird[] = [], rows: Json[] = [];
  const add = (bird: FarmBird, coopId: string, origin: string, ageDays: [number, number], notes = '', parents: { mother?: string; father?: string } = {}) => {
    birds.push(bird);
    rows.push({ id: bird.id, name: bird.name, sex: bird.sex, breed: bird.breed, coopId, status: bird.status, bornAt: dateOnly(now - between(random, ageDays[0], ageDays[1]) * DAY), origin, motherId: parents.mother ?? '', fatherId: parents.father ?? '', photo: bird.photo, notes });
  };
  const chickLineage = new Map<string, { mother: string; father: string }>();
  let henIndex = 0, roosterIndex = 0, chickIndex = 0;
  for (const [position, breed] of profile.breeds.entries()) {
    const photos = BREED_PHOTOS[breed];
    // Linaje de cada raza: una abuela (fallecida), su hija la madre y un padre de origen externo; las aves de la raza descienden de ellos.
    const grandmother: FarmBird = { id: `bird-${profile.slug}-a${position}`, name: henNames[henIndex++], sex: 'Gallina', breed, status: 'Fallecido', photo: `/seed/${photoFile(photos.hen[0])}` };
    add(grandmother, adultCoops[0].id, 'Compra local', [1000, 1400], 'Fundadora de la línea; falleció de vejez.');
    const mother: FarmBird = { id: `bird-${profile.slug}-m${position}`, name: henNames[henIndex++], sex: 'Gallina', breed, status: 'Activo', photo: `/seed/${photoFile(photos.hen[1 % photos.hen.length])}` };
    add(mother, adultCoops[0].id, 'Nacida en la granja', [650, 900], 'Madre de la línea actual.', { mother: grandmother.id });
    const father: FarmBird = { id: `bird-${profile.slug}-f${position}`, name: roosterNames[roosterIndex++], sex: 'Gallo', breed, status: 'En reproducción', photo: `/seed/${photoFile(photos.rooster[0])}` };
    add(father, adultCoops[0].id, 'Compra local', [650, 900], 'Reproductor principal de la línea.');
    const lineage = { mother: mother.id, father: father.id };
    chickLineage.set(breed, lineage);
    const hens = between(random, 3, 4);
    for (let i = 0; i < hens; i++) {
      add({ id: `bird-${profile.slug}-h${henIndex}`, name: henNames[henIndex++], sex: 'Gallina', breed, status: pick(random, STATUS_HEN), photo: `/seed/${photoFile(photos.hen[i % photos.hen.length])}` }, adultCoops[i % adultCoops.length].id, 'Nacida en la granja', [200, 560], i === 0 ? 'Muy buena ponedora y mansa.' : '', lineage);
    }
    add({ id: `bird-${profile.slug}-g${roosterIndex}`, name: roosterNames[roosterIndex++], sex: 'Gallo', breed, status: 'En reproducción', photo: `/seed/${photoFile(photos.rooster[0])}` }, adultCoops[0].id, 'Nacido en la granja', [300, 600], 'Buen porte y carácter tranquilo.', lineage);
  }
  for (const breed of profile.breeds.slice(0, 2)) {
    const photos = BREED_PHOTOS[breed];
    add({ id: `bird-${profile.slug}-p${chickIndex}`, name: chickNames[chickIndex++], sex: 'Pollito', breed, status: 'Activo', photo: `/seed/${photoFile(photos.chick[0])}` }, chickCoop.id, 'Nacido en la granja', [12, 30], '', chickLineage.get(breed));
  }
  const eggs = Array.from({ length: 14 }, (_, i) => {
    const total = between(random, 4, 14);
    return { id: `egg-${profile.slug}-${i}`, date: dateOnly(now - i * DAY), coopId: coops[0].id, eggs: total, broken: random() < 0.2 ? 1 : 0, dirty: random() < 0.25 ? 1 : 0, incubation: 0, consumption: between(random, 1, 3), sale: Math.max(0, total - 3), notes: '' };
  });
  const token = `${profile.slug.slice(0, 4).toUpperCase().padEnd(4, 'X')}${String(index).padStart(2, '0')}`;
  const chickLots = profile.breeds.slice(0, 2).map((breed, i) => {
    const initial = between(random, 25, 60);
    return { id: `chick-lot-${profile.slug}-${i}`, code: `POL-000${i + 1}-${token}${i}0`, birthId: '', sourceLotIds: [], incubationId: '', breed, initial, available: initial - between(random, 0, 8), sold: 0, coopId: chickCoop.id, notes: 'Camada de la última incubación.' };
  });
  const fertileLots = profile.breeds.slice(0, 2).map((breed, i) => {
    const initial = between(random, 40, 120);
    return { id: `fertile-lot-${profile.slug}-${i}`, code: `FER-000${i + 1}-${token}${i}0`, sourceCollectionId: '', productType: 'Huevo fértil', date: dateOnly(now - between(random, 1, 4) * DAY), coopId: coops[0].id, breed, initial, available: initial, sold: 0, incubated: 0, discarded: 0, fertility: pick(random, ['Confirmada', 'Confirmada', 'Pendiente']), storageNotes: 'Almacenados frescos y ventilados.', notes: '' };
  });
  const supplyDefs = shuffled(random, SUPPLIES).slice(0, between(random, 5, 6));
  const customProducts = supplyDefs.map((def, i) => ({
    id: `product-${profile.slug}-${i}`, code: `PRO-${String(i + 1).padStart(4, '0')}-${token}${i}0`, name: def.name, category: def.category, unit: def.unit,
    price: round(between(random, def.min, def.max), 100), available: between(random, def.stock[0], def.stock[1]),
  }));
  const purchases = [
    { id: `buy-${profile.slug}-1`, date: dateOnly(now - 9 * DAY), product: 'Concentrado ponedoras', category: 'Alimento ponedoras', quantity: 40, unit: 'kg', unitPrice: between(random, 2600, 3200), supplier: 'Agropecuaria local', coopId: coops[0].id, notes: '' },
    { id: `buy-${profile.slug}-2`, date: dateOnly(now - 4 * DAY), product: 'Viruta de pino', category: 'Viruta y aserrín', quantity: 20, unit: 'kg', unitPrice: between(random, 750, 950), supplier: 'Maderas de la región', coopId: coops[0].id, notes: '' },
  ];
  const stock = [
    { id: `stock-${profile.slug}-feed`, product: 'Concentrado ponedoras', category: 'Alimento', quantity: between(random, 15, 40), unit: 'kg', minimum: 12 },
    { id: `stock-${profile.slug}-shavings`, product: 'Viruta de pino', category: 'Viruta', quantity: between(random, 6, 18), unit: 'kg', minimum: 8 },
  ];
  const maintenance = [
    { id: `maint-${profile.slug}-1`, title: 'Limpiar bebederos y comederos', coopId: coops[0].id, frequencyDays: 3, lastDone: dateOnly(now - DAY), nextDue: dateOnly(now + 2 * DAY), status: 'Próxima', supplies: 0, notes: '' },
    { id: `maint-${profile.slug}-2`, title: 'Renovar viruta de nidos', coopId: coops[0].id, frequencyDays: 14, lastDone: dateOnly(now - 6 * DAY), nextDue: dateOnly(now + 8 * DAY), status: 'Próxima', supplies: 0, notes: '' },
  ];
  const data = normalizeFarmData({ ...emptyFarmData(), coops, birds: rows, eggs, chickLots, fertileLots, customProducts, purchases, stock, maintenance } as never) as unknown as Json;
  delete data.demoContent;
  return { data, birds, chickLots, fertileLots, customProducts, supplyDefs };
}

/** Crea (o completa) la comunidad de ejemplo. Las cuentas que ya existen se dejan como están. */
export async function seedCommunity(deps: Deps, assets: SeedAssets, options: { now?: Date; log?: (message: string) => void } = {}): Promise<SeedReport> {
  const now = options.now ?? new Date(), log = options.log ?? (() => undefined);
  const report: SeedReport = { users: 0, skipped: 0, posts: 0, listings: 0, listingsByType: {}, likes: 0, comments: 0, follows: 0 };
  const created: { profile: SeedProfile; id: string }[] = [];

  for (const [index, profile] of PROFILES.entries()) {
    const email = seedEmail(profile.slug);
    const existing = await deps.store.tx(async tx => (await tx.users.list()).find(user => user.email === email));
    if (existing) { report.skipped++; log(`· ${profile.name}: ya existe, se deja igual.`); continue; }
    const taken = await deps.store.tx(async tx => (await tx.users.list()).some(user => (user.displayName ?? '').toLocaleLowerCase('es-CO') === profile.name.toLocaleLowerCase('es-CO')));
    if (taken) { report.skipped++; log(`· ${profile.name}: ese nombre ya lo usa otra cuenta, se omite.`); continue; }

    const id = randomUUID();
    const joined = new Date(now.getTime() - between(rng(index + 11), 40, 200) * DAY);
    const user: UserRecord = { id, email, passwordHash: 'disabled-seed-account', createdAt: joined.toISOString(), displayName: profile.name, timeZone: 'America/Bogota', social: seedSocialLinks(profile.slug, index), location: { city: profile.city, region: profile.region } };
    await deps.store.tx(async tx => {
      await tx.users.insert(user);
      await tx.farms.insert({ id, data: emptyFarmData(), version: 1, updatedAt: joined.toISOString() } satisfies FarmRecord);
    });
    const ctxAt = (at: number): Ctx => ({ userId: id, now: new Date(Math.min(at, now.getTime() - HOUR)) });

    // Foto de perfil
    const avatar = assets.image(`avatar-${profile.slug}.jpg`);
    const avatarItem = await uploadMedia(deps, ctxAt(joined.getTime() + HOUR), { bytes: avatar.bytes, mime: 'image/jpeg', purpose: 'avatar', width: avatar.width, height: avatar.height });
    await setAvatar(deps, ctxAt(joined.getTime() + HOUR), avatarItem.id);

    // Granja: gallineros, aves, lotes, insumos, huevos, compras, tareas
    const farm = buildFarm(profile, index, now.getTime());
    await deps.store.tx(async tx => {
      const row = (await tx.farms.get(id))!;
      await applyFarmSave(tx, id, { data: farm.data, version: row.version }, new Date(joined.getTime() + 2 * HOUR));
    });

    // Publicaciones del muro (13), repartidas en el último mes, con la foto de la raza que mencionan
    const random = rng(104729 * (index + 5));
    const hens: Record<string, string[]> = {}, roosters: Record<string, string[]> = {};
    for (const bird of farm.birds) { if (bird.sex === 'Gallina') (hens[bird.breed] ??= []).push(bird.name); if (bird.sex === 'Gallo') (roosters[bird.breed] ??= []).push(bird.name); }
    const usedPhotos = new Set<string>();
    const choosePhoto = (options: string[]): string | undefined => {
      const fresh = options.filter(name => !usedPhotos.has(name));
      const name = fresh.length ? pick(random, fresh) : undefined;
      if (name) usedPhotos.add(name);
      return name;
    };
    for (const plan of buildPostPlans(profile, { profile, hens, roosters }, random, 13, farm.supplyDefs as SupplyDef[])) {
      const ctx = ctxAt(now.getTime() - plan.daysAgo * DAY + between(random, 6, 20) * HOUR - 12 * HOUR);
      const photos = BREED_PHOTOS[plan.breed];
      const photo = plan.kind === 'hen' ? choosePhoto(photos.hen) : plan.kind === 'rooster' ? choosePhoto(photos.rooster) : plan.kind === 'chick' ? choosePhoto(photos.chick) : plan.kind === 'eggs' ? choosePhoto(EGG_PHOTOS) : plan.kind === 'supply' ? choosePhoto(plan.supply?.photos ?? []) : undefined;
      const mediaIds: string[] = [];
      if (photo) {
        const image = assets.image(photoFile(photo));
        mediaIds.push((await uploadMedia(deps, ctx, { bytes: image.bytes, mime: 'image/jpeg', purpose: 'post', width: image.width, height: image.height })).id);
      }
      await createPost(deps, ctx, { text: plan.text, mediaIds });
      report.posts++;
    }

    // Avisos del mercado (10 o más): aves, lote de aves, pollitos, huevos fértiles e insumos
    let listingNumber = 0;
    const publish = async (type: string, input: Omit<ListingInput, 'consent'> & { consent: Json }, label: string) => {
      const at = now.getTime() - (1 + listingNumber++ * 1.7) * DAY;
      try {
        await createListing(deps, ctxAt(at), { ...input, publish: true } as ListingInput);
        report.listings++; report.listingsByType[type] = (report.listingsByType[type] ?? 0) + 1;
      } catch (error) { log(`  ! aviso «${label}» omitido: ${error instanceof Error ? error.message : String(error)}`); }
    };
    // Los fundadores de cada línea (abuela, madre y padre) se quedan en la granja: son el linaje de las aves que se venden.
    const sellable = shuffled(random, farm.birds.filter(bird => bird.sex !== 'Pollito' && !/-[amf]\d+$/.test(bird.id) && (bird.status === 'Activo' || bird.status === 'En reproducción')));
    const roosterPool = sellable.filter(bird => bird.sex === 'Gallo'), henPool = sellable.filter(bird => bird.sex === 'Gallina');
    // El lote de aves sale de la raza con más gallinas a la venta; las aves sueltas, del resto.
    const counts = new Map<string, number>();
    for (const bird of henPool) counts.set(bird.breed, (counts.get(bird.breed) ?? 0) + 1);
    const groupBreed = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const group = henPool.filter(bird => bird.breed === groupBreed).slice(0, 3);
    const chickPool = shuffled(random, farm.birds.filter(bird => bird.sex === 'Pollito'));
    const singles = [...roosterPool.slice(0, 1), ...henPool.filter(bird => !group.includes(bird)).slice(0, 3), ...chickPool.slice(0, 1)];
    const zone = `${profile.city}, ${profile.region}`;
    const birdPhoto = (bird: FarmBird) => assets.image(smallFile(assets, bird.photo.replace('/seed/', '').replace(/\.jpg$/, '')));

    for (const bird of singles) {
      const sex = bird.sex === 'Gallo' ? 'Gallo' : 'Gallina';
      const roll = random();
      const kind = roll < 0.6 ? 'fixed' : roll < 0.82 ? 'auction' : 'interest';
      const price = bird.sex === 'Pollito' ? between(random, 12, 30) * 1000 : round(between(random, sex === 'Gallo' ? 90 : 70, sex === 'Gallo' ? 260 : 190), 5) * 1000;
      await publish('ave', {
        birdId: bird.id, kind, photos: [dataUrl(birdPhoto(bird))],
        ...(kind === 'fixed' ? { price } : {}),
        ...(kind === 'auction' ? { auction: { startingPrice: round(price * 0.6, 1000), closesAt: new Date(now.getTime() + between(random, 2, 12) * DAY).toISOString() } } : {}),
        consent: { description: pick(random, LISTING_NOTES[sex]), deliveryZone: zone, healthNote: pick(random, HEALTH_NOTES[sex]), showPhoto: true, showGenealogy: true },
      }, bird.name);
    }
    if (group.length >= 2) {
      const photo = assets.image(smallFile(assets, pick(random, BREED_PHOTOS[groupBreed].hen)));
      await publish('lote_aves', {
        itemType: 'lote_aves', birdIds: group.map(bird => bird.id), kind: 'fixed', price: round(group.length * between(random, 60, 120) * 1000 * 0.9, 5000), photos: [dataUrl(photo)],
        consent: { description: `Lote de ${group.length} gallinas ${groupBreed} de la misma línea, criadas juntas.`, deliveryZone: zone, healthNote: pick(random, HEALTH_NOTES.Gallina), showPhoto: true },
      }, `lote de ${groupBreed}`);
    }
    for (const lot of farm.chickLots) {
      const quantity = Math.min(lot.available, between(random, 10, 25)), unit = between(random, 6, 14) * 1000;
      const photo = assets.image(smallFile(assets, pick(random, BREED_PHOTOS[lot.breed].chick)));
      await publish('lote_pollitos', {
        itemType: 'lote_pollitos', lotId: lot.id, quantity, kind: 'fixed', price: quantity * unit, photos: [dataUrl(photo)],
        consent: { description: `Pollitos ${lot.breed} de pocos días, vacunados y con buen arranque.`, deliveryZone: zone, healthNote: 'Vacunados contra Marek al nacer.' },
      }, `pollitos ${lot.breed}`);
    }
    for (const lot of farm.fertileLots) {
      const quantity = Math.min(lot.available, between(random, 12, 36)), unit = between(random, 1500, 4000);
      const photo = assets.image(smallFile(assets, pick(random, EGG_PHOTOS)));
      await publish('lote_huevos', {
        itemType: 'lote_huevos', lotId: lot.id, quantity, kind: 'fixed', price: quantity * unit, photos: [dataUrl(photo)],
        consent: { description: `Huevos fértiles de ${lot.breed}, de gallinas con gallo en reproducción. Recogidos esta semana.`, deliveryZone: zone },
      }, `huevos ${lot.breed}`);
    }
    for (const [i, product] of farm.customProducts.entries()) {
      const def = farm.supplyDefs[i], quantity = Math.max(1, Math.min(product.available, product.unit === 'kg' ? between(random, 20, 80) : between(random, 1, 3)));
      const photo = assets.image(smallFile(assets, pick(random, def.photos)));
      await publish('insumo', {
        itemType: 'insumo', lotId: product.id, quantity, kind: 'fixed', price: product.price * quantity, photos: [dataUrl(photo)],
        consent: { description: def.note, deliveryZone: zone },
      }, product.name);
    }
    created.push({ profile, id });
    report.users++;
    log(`✓ ${profile.name} (${profile.city}): ${farm.birds.length} aves y ${farm.customProducts.length} insumos en la granja.`);
  }

  // Vida social entre las cuentas creadas: seguidores, me gusta y comentarios
  if (created.length > 1) Object.assign(report, await weaveSocial(deps.store, created, now));
  return report;
}

async function weaveSocial(store: Store, accounts: { profile: SeedProfile; id: string }[], now: Date): Promise<Pick<SeedReport, 'likes' | 'comments' | 'follows'>> {
  const random = rng(2026101);
  const out = { likes: 0, comments: 0, follows: 0 };
  await store.tx(async tx => {
    const ids = accounts.map(account => account.id);
    for (const account of accounts) {
      const others = shuffled(random, ids.filter(id => id !== account.id)).slice(0, between(random, 5, Math.min(14, ids.length - 1)));
      for (const other of others) {
        const id = `${account.id}:${other}`;
        if (await tx.follows.get(id)) continue;
        await tx.follows.insert({ id, followerId: account.id, followingId: other, createdAt: new Date(now.getTime() - between(random, 1, 30) * DAY).toISOString() });
        out.follows++;
      }
    }
    for (const account of accounts) {
      for (const post of await tx.posts.list({ authorId: account.id })) {
        const postedAt = new Date(post.createdAt).getTime();
        const fans = shuffled(random, ids.filter(id => id !== account.id)).slice(0, between(random, 1, Math.min(14, ids.length - 1)));
        for (const fan of fans) {
          const id = `${post.id}:${fan}`;
          if (await tx.postLikes.get(id)) continue;
          await tx.postLikes.insert({ id, postId: post.id, userId: fan, createdAt: new Date(Math.min(now.getTime(), postedAt + between(random, 1, 70) * HOUR)).toISOString() });
          out.likes++;
        }
        const talkers = shuffled(random, ids.filter(id => id !== account.id)).slice(0, between(random, 0, 3));
        for (const talker of talkers) {
          const commentId = randomUUID(), at = Math.min(now.getTime(), postedAt + between(random, 1, 48) * HOUR);
          await tx.postComments.insert({ id: commentId, postId: post.id, authorId: talker, text: pick(random, COMMENT_POOL), createdAt: new Date(at).toISOString() });
          out.comments++;
          if (random() < 0.45) {
            await tx.postComments.insert({ id: randomUUID(), postId: post.id, parentId: commentId, replyToUserId: talker, authorId: account.id, text: pick(random, REPLY_POOL), createdAt: new Date(Math.min(now.getTime(), at + between(random, 1, 12) * HOUR)).toISOString() });
            out.comments++;
          }
        }
      }
    }
  });
  return out;
}

/** Borra todo lo que creó `seedCommunity` (cuentas con el correo de la semilla y su contenido). No toca cuentas reales. */
export async function removeSeedCommunity(deps: Deps): Promise<{ users: number }> {
  const doomedMedia: string[] = [];
  const users = await deps.store.tx(async tx => {
    const seeded = (await tx.users.list()).filter(user => user.email.endsWith(`@${SEED_EMAIL_DOMAIN}`));
    const ids = new Set(seeded.map(user => user.id));
    if (!ids.size) return 0;
    const posts = (await tx.posts.list()).filter(post => ids.has(post.authorId));
    const postIds = new Set(posts.map(post => post.id));
    for (const row of await tx.postLikes.list()) if (ids.has(row.userId) || postIds.has(row.postId)) await tx.postLikes.remove(row.id);
    for (const row of await tx.postComments.list()) if (ids.has(row.authorId) || postIds.has(row.postId)) await tx.postComments.remove(row.id);
    for (const post of posts) await tx.posts.remove(post.id);
    for (const row of await tx.follows.list()) if (ids.has(row.followerId) || ids.has(row.followingId)) await tx.follows.remove(row.id);
    for (const listing of (await tx.listings.list()).filter(row => ids.has(row.sellerId))) {
      for (const lock of await tx.locks.list({ listingId: listing.id })) await tx.locks.remove(lock.id);
      for (const row of await tx.interests.list({ listingId: listing.id })) await tx.interests.remove(row.id);
      for (const row of await tx.bids.list({ listingId: listing.id })) await tx.bids.remove(row.id);
      for (const photoId of listing.photoIds ?? []) doomedMedia.push(photoId);
      await tx.listings.remove(listing.id);
    }
    for (const item of await tx.mediaItems.list()) if (ids.has(item.ownerId)) { await tx.mediaItems.remove(item.id); doomedMedia.push(item.id); }
    for (const row of await tx.ownership.list()) if (ids.has(row.ownerId)) { for (const history of await tx.ownershipHistory.list({ birdId: row.id })) await tx.ownershipHistory.remove(history.id); await tx.ownership.remove(row.id); }
    for (const row of await tx.notifications.list()) if (ids.has(row.userId)) await tx.notifications.remove(row.id);
    for (const row of await tx.sessions.list()) if (ids.has(row.userId)) await tx.sessions.remove(row.id);
    for (const user of seeded) { if (await tx.farms.get(user.id)) await tx.farms.remove(user.id); await tx.users.remove(user.id); }
    return seeded.length;
  });
  for (const id of doomedMedia) { try { await deps.media.delete(id); } catch { /* ya no estaba */ } }
  return { users };
}
