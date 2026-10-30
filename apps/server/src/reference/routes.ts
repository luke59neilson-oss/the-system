// MU.6: the GM-only Reference view's search (under /api/gm/, behind the GM
// key like every non-public /api route). Players never get these lists.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  REFERENCE_LIST_LABELS,
  REFERENCE_LISTS,
  referenceEntries,
  searchReference,
} from './reference';

const query = z.object({
  q: z.string().max(200).optional(),
  list: z.enum(REFERENCE_LISTS).optional(),
  godTied: z.enum(['0', '1']).optional(),
});

export function registerReferenceRoutes(app: FastifyInstance): void {
  app.get('/api/gm/reference', (request, reply) => {
    const parsed = query.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Bad reference search' });
    const { q, list, godTied } = parsed.data;
    const result = searchReference(referenceEntries(), {
      q,
      list: list ?? null,
      godTied: godTied !== '0',
    });
    return {
      lists: REFERENCE_LISTS.map((id) => ({ id, label: REFERENCE_LIST_LABELS[id] })),
      total: result.total,
      entries: result.entries,
    };
  });
}
