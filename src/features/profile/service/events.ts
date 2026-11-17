import type { EventDef, EventRegistry } from '../../notifications/service/events.ts';
import { aliasOf } from '../../market/service/snapshot.ts';
import type { Tx } from '../../../server/storage/types.ts';

const clip = (text: string, max = 140) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const aliasById = async (tx: Tx, id: unknown) => { const user = await tx.users.get(String(id)); return user ? aliasOf(user) : 'Alguien'; };

/** Enlace a una publicación: `<id del autor>#<id de la publicación>` (la pantalla abre el perfil del autor y destaca la publicación). */
const postLink = (event: { payload: Record<string, unknown> }) => ({ view: 'post', id: `${String(event.payload.authorId)}#${String(event.payload.postId)}` });
const preview = async (tx: Tx, postId: unknown) => { const post = await tx.posts.get(String(postId)); return post ? (clip(post.text) || 'Publicación con fotos o videos') : 'tu publicación'; };

const base = { category: 'comercial', priority: 'baja', critical: false } as const satisfies Pick<EventDef, 'category' | 'priority' | 'critical'>;

// Eventos sociales del perfil. Las plantillas solo usan datos que el destinatario puede ver.
export const profileEvents: EventRegistry = {
  'profile.post.liked': {
    ...base,
    recipients: async (_tx, event) => [String(event.payload.authorId)],
    render: async (tx, event) => ({ title: `${await aliasById(tx, event.payload.likerId)} le dio me gusta a tu publicación`, body: await preview(tx, event.payload.postId), link: postLink(event) }),
  },
  'profile.post.shared': {
    ...base, priority: 'normal',
    recipients: async (_tx, event) => [String(event.payload.authorId)],
    render: async (tx, event) => ({ title: `${await aliasById(tx, event.payload.sharerId)} compartió tu publicación`, body: await preview(tx, event.payload.postId), link: postLink(event) }),
  },
  'profile.post.commented': {
    ...base, priority: 'normal',
    recipients: async (_tx, event) => [String(event.payload.authorId)],
    render: async (tx, event) => {
      const comment = await tx.postComments.get(String(event.payload.commentId));
      return { title: `${await aliasById(tx, comment?.authorId)} comentó tu publicación`, body: clip(comment?.text ?? ''), link: postLink(event) };
    },
  },
  'profile.comment.replied': {
    ...base, priority: 'normal',
    recipients: async (_tx, event) => [String(event.payload.toUserId)],
    render: async (tx, event) => {
      const comment = await tx.postComments.get(String(event.payload.commentId));
      return { title: `${await aliasById(tx, comment?.authorId)} respondió tu comentario`, body: clip(comment?.text ?? ''), link: postLink(event) };
    },
  },
};
