#!/usr/bin/env node
/**
 * One-shot: migrate organizations.settings.assignment.inboxes[] JSON into DB inboxes + inbox_members.
 * Usage: node server/scripts/migrateAssignmentInboxesToDb.js [--org=<uuid>]
 */
import '../src/config/env.js';
import { mergeOrgAssignmentRouting, slugifyInboxName } from '@ai-support/shared';
import { supabaseAdmin } from '../src/config/supabase.js';

const orgFilter = process.argv.find((a) => a.startsWith('--org='))?.split('=')[1]?.trim() || null;

async function migrateOrg(org) {
  const settings = org.settings && typeof org.settings === 'object' ? org.settings : {};
  const routing = mergeOrgAssignmentRouting(settings.assignment);
  const inboxes = routing.inboxes ?? [];
  if (inboxes.length === 0) return { orgId: org.id, created: 0 };

  let created = 0;
  const idMap = {};

  for (const legacy of inboxes) {
    const slug = slugifyInboxName(legacy.name || legacy.id);
    const isDefault = legacy.id === routing.defaultInboxId;

    const { data: existing } = await supabaseAdmin
      .from('inboxes')
      .select('id, slug, settings')
      .eq('organization_id', org.id)
      .or(`slug.eq.${slug},settings->>legacyAssignmentInboxId.eq.${legacy.id}`)
      .limit(1)
      .maybeSingle();

    let inboxId = existing?.id ?? null;
    if (!inboxId) {
      const { data: row, error } = await supabaseAdmin
        .from('inboxes')
        .insert({
          organization_id: org.id,
          name: legacy.name || legacy.id,
          slug,
          status: 'active',
          is_default: isDefault,
          settings: {
            channels: legacy.channels ?? [],
            intents: legacy.intents ?? [],
            languages: legacy.languages ?? [],
            tags: legacy.tags ?? [],
            legacyAssignmentInboxId: legacy.id,
          },
        })
        .select('id')
        .single();
      if (error) {
        console.warn(JSON.stringify({ event: 'migrate_inbox_skip', org_id: org.id, legacy_id: legacy.id, error: error.message }));
        continue;
      }
      inboxId = row.id;
      created += 1;
    }
    idMap[legacy.id] = inboxId;

    if (legacy.memberIds?.length) {
      const rows = legacy.memberIds.map((organizationMemberId) => ({
        inbox_id: inboxId,
        organization_member_id: organizationMemberId,
        role: 'member',
      }));
      await supabaseAdmin.from('inbox_members').upsert(rows, {
        onConflict: 'inbox_id,organization_member_id',
        ignoreDuplicates: true,
      });
    }
  }

  const defaultUuid = idMap[routing.defaultInboxId];
  if (defaultUuid) {
    await supabaseAdmin.from('inboxes').update({ is_default: false }).eq('organization_id', org.id);
    await supabaseAdmin.from('inboxes').update({ is_default: true }).eq('id', defaultUuid);
  }

  const settingsPatch = {
    ...settings,
    inboxes: {
      ...(settings.inboxes && typeof settings.inboxes === 'object' ? settings.inboxes : {}),
      enabled: true,
      migratedFromAssignment: true,
      legacyIdMap: idMap,
    },
  };

  await supabaseAdmin.from('organizations').update({ settings: settingsPatch }).eq('id', org.id);

  return { orgId: org.id, created, idMap };
}

async function main() {
  let q = supabaseAdmin.from('organizations').select('id, settings');
  if (orgFilter) q = q.eq('id', orgFilter);

  const { data: orgs, error } = await q;
  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  for (const org of orgs ?? []) {
    const result = await migrateOrg(org);
    console.info(JSON.stringify({ event: 'migrate_assignment_inboxes', ...result }));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
