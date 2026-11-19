import type { APIRoute } from 'astro';
import { apiError, requireApiProfile } from '../../../server/api-identity';

export const prerender = false;
export const ALL: APIRoute = async (context) => {
  const profile = await requireApiProfile(context, true);
  return profile instanceof Response ? profile : apiError('admin_route_retired', 410);
};
