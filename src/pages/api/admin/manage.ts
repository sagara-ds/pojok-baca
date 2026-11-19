import type { APIRoute } from 'astro';
import { apiError, boundedBody, noStore, requireApiProfile, sameOrigin, uuidPattern } from '../../../server/api-identity';
import { getDatabase } from '../../../server/database';
import { isPublicSlug } from '../../../services/curation';

export const prerender = false;
const redirect = (url:string,result:string) => new Response(null,{status:303,headers:{...noStore,Location:`${url}?result=${encodeURIComponent(result)}`}});

export const POST: APIRoute = async (context) => {
  const actor = await requireApiProfile(context,true);
  if (actor instanceof Response) return actor;
  if (!sameOrigin(context)) return apiError('forbidden',403);
  try {
    const fields = new URLSearchParams(new TextDecoder().decode(await boundedBody(context.request,2500)));
    const action = fields.get('action');
    const sql = getDatabase();
    if (action==='moderate') {
      const kind=fields.get('kind'), id=fields.get('id')??'', decision=fields.get('decision');
      if ((kind!=='quote' && kind!=='comment') || !/^\d{1,18}$/.test(id) || (decision!=='approved' && decision!=='rejected')) {
        return apiError('invalid_action',400);
      }
      const [{ok}] = await sql`SELECT pojok_baca.admin_moderate(${actor.user_id}::uuid,${kind},${id}::bigint,${decision}) AS ok`;
      return redirect('/admin/moderation/',ok ? 'ok' : 'no_change');
    }
    if (action==='recommend') {
      const slug=fields.get('slug')??'', enabled=fields.get('enabled');
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || !isPublicSlug(slug) || (enabled!=='true' && enabled!=='false')) return apiError('invalid_action',400);
      const [{ok}] = await sql`SELECT pojok_baca.admin_recommend(${actor.user_id}::uuid,${slug},${enabled==='true'}) AS ok`;
      return redirect('/admin/catalog/',ok ? 'ok' : 'no_change');
    }
    if (action==='user') {
      if (actor.role!=='super_admin') return apiError('forbidden',403);
      const id=fields.get('id')??'', role=fields.get('role'), active=fields.get('active');
      if (!uuidPattern.test(id) || (!role && active===null)
        || (role!==null && !['user','admin','super_admin'].includes(role))
        || (active!==null && !['true','false'].includes(active))) return apiError('invalid_action',400);
      const [{result}] = await sql`SELECT pojok_baca.super_admin_update_user(${actor.user_id}::uuid,${id}::uuid,
       ${role},${active===null ? null : active==='true'}::boolean) AS result`;
      if (result==='forbidden') return apiError('forbidden',403);
      return redirect('/admin/users/',result);
    }
    return apiError('invalid_action',400);
  } catch (error) {
    return apiError('admin_unavailable',error instanceof RangeError ? 413 : 503);
  }
};
