import { supabaseAdmin } from '../../config/supabase.js';

const STALE_DAYS = 90;

/**
 * @param {string} organizationId
 * @param {Date} fromDate
 * @param {Date} toExclusive
 */
export async function fetchKnowledgeMetrics(organizationId, fromDate, toExclusive) {
  const fromIso = fromDate.toISOString();
  const toIso = toExclusive.toISOString();
  const staleBefore = new Date(toExclusive);
  staleBefore.setDate(staleBefore.getDate() - STALE_DAYS);
  const staleIso = staleBefore.toISOString();

  const [
    publishedRes,
    draftRes,
    staleRes,
    searchEventsRes,
    viewEventsRes,
    ingestFailedRes,
    ingestOkRes,
    sourcesFailedRes,
  ] = await Promise.all([
    supabaseAdmin
      .from('knowledge_articles')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'published')
      .is('deleted_at', null),

    supabaseAdmin
      .from('knowledge_articles')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'draft')
      .is('deleted_at', null),

    supabaseAdmin
      .from('knowledge_articles')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'published')
      .is('deleted_at', null)
      .lt('updated_at', staleIso),

    supabaseAdmin
      .from('support_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('event_type', 'knowledge.search')
      .gte('created_at', fromIso)
      .lt('created_at', toIso),

    supabaseAdmin
      .from('support_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('event_type', 'knowledge.article_viewed')
      .gte('created_at', fromIso)
      .lt('created_at', toIso),

    supabaseAdmin
      .from('support_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('event_type', 'knowledge.ingest_failed')
      .gte('created_at', fromIso)
      .lt('created_at', toIso),

    supabaseAdmin
      .from('support_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('event_type', 'knowledge.ingest_completed')
      .gte('created_at', fromIso)
      .lt('created_at', toIso),

    supabaseAdmin
      .from('knowledge_sources')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'failed')
      .is('deleted_at', null),
  ]);

  const tableMissing = (err) =>
    err?.code === '42P01' || err?.code === 'PGRST205' || err?.message?.includes('knowledge_');

  if (publishedRes.error && tableMissing(publishedRes.error)) {
    return { available: false, message: 'Knowledge base is not configured for this workspace.' };
  }

  return {
    available: true,
    publishedArticles: publishedRes.count ?? 0,
    draftArticles: draftRes.count ?? 0,
    staleArticles: staleRes.count ?? 0,
    searchesInRange: searchEventsRes.count ?? 0,
    articleViewsInRange: viewEventsRes.count ?? 0,
    ingestCompletedInRange: ingestOkRes.count ?? 0,
    ingestFailedInRange: ingestFailedRes.count ?? 0,
    sourcesFailedTotal: sourcesFailedRes.count ?? 0,
    staleDays: STALE_DAYS,
  };
}
