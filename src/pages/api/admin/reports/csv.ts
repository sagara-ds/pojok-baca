import type { APIRoute } from 'astro';
import { apiError, boundedBody, noStore, requireApiProfile, sameOrigin } from '../../../../server/api-identity';
import { report } from '../../../../server/teacher-admin';
import { reportFilters, teacherCsv } from '../../../../services/report-format';

export const prerender = false;
export const POST: APIRoute = async (context) => {
  const actor = await requireApiProfile(context,true);
  if (actor instanceof Response) return actor;
  if (actor.role !== 'super_admin' || !sameOrigin(context)) return apiError('forbidden',403);
  try {
    const params = new URLSearchParams(new TextDecoder().decode(await boundedBody(context.request,2000)));
    const filters=reportFilters(params);
    if (!filters.valid) return apiError('invalid_range',400);
    const data=await report(actor.user_id,filters,true);
    if (!data) return apiError('forbidden',403);
    return new Response(teacherCsv(data.rows),{headers:{
      ...noStore,'Content-Type':'text/csv; charset=utf-8',
      'Content-Disposition':`attachment; filename="pojok-baca-${filters.from}-${filters.to}.csv"`,
    }});
  } catch (error) {
    return apiError('report_unavailable',error instanceof RangeError ? 413 : 503);
  }
};
