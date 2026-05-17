import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/httpError.js';
import { ensureOrgMembership } from './support.service.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_TAGS_PER_CONVERSATION = 32;

function isMissingTagsTable(error) {
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    error?.message?.includes('tag_definitions')
  );
}

function assertUuid(id, field) {
  if (typeof id !== 'string' || !UUID_RE.test(id.trim())) {
    throw new HttpError(400, `${field} must be a valid UUID.`);
  }
  return id.trim();
}

export async function listTagDefinitions(organizationId) {
  const { data, error } = await supabaseAdmin
    .from('tag_definitions')
    .select('id, organization_id, name, color, created_at')
    .eq('organization_id', organizationId)
    .order('name', { ascending: true });

  if (error) {
    if (isMissingTagsTable(error)) {
      throw new HttpError(503, 'Tags are not available. Apply database migrations.');
    }
    throw new HttpError(500, error.message || 'Failed to list tags.');
  }

  return { tags: data ?? [] };
}

export async function createTagDefinition({ organizationId, actorUserId, name, color }) {
  await ensureOrgMembership(actorUserId, organizationId);

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!trimmedName || trimmedName.length > 64) {
    throw new HttpError(400, 'name is required (max 64 characters).');
  }

  const tagColor = typeof color === 'string' && color.trim() ? color.trim() : '#64748b';
  if (!COLOR_RE.test(tagColor)) {
    throw new HttpError(400, 'color must be a hex value like #64748b.');
  }

  const { data, error } = await supabaseAdmin
    .from('tag_definitions')
    .insert({
      organization_id: organizationId,
      name: trimmedName,
      color: tagColor,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new HttpError(409, 'A tag with this name already exists.');
    }
    throw new HttpError(500, error.message || 'Failed to create tag.');
  }

  return { tag: data };
}

export async function patchTagDefinition({ organizationId, tagId, name, color }) {
  assertUuid(tagId, 'tagId');
  const updates = {};

  if (name !== undefined) {
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName || trimmedName.length > 64) {
      throw new HttpError(400, 'name must be 1–64 characters.');
    }
    updates.name = trimmedName;
  }

  if (color !== undefined) {
    const tagColor = typeof color === 'string' ? color.trim() : '';
    if (!COLOR_RE.test(tagColor)) {
      throw new HttpError(400, 'color must be a hex value like #64748b.');
    }
    updates.color = tagColor;
  }

  if (Object.keys(updates).length === 0) {
    throw new HttpError(400, 'Provide name and/or color to update.');
  }

  const { data, error } = await supabaseAdmin
    .from('tag_definitions')
    .update(updates)
    .eq('id', tagId)
    .eq('organization_id', organizationId)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new HttpError(409, 'A tag with this name already exists.');
    }
    throw new HttpError(500, error.message || 'Failed to update tag.');
  }
  if (!data) throw new HttpError(404, 'Tag not found.');
  return { tag: data };
}

export async function deleteTagDefinition({ organizationId, tagId }) {
  assertUuid(tagId, 'tagId');

  const { error } = await supabaseAdmin
    .from('tag_definitions')
    .delete()
    .eq('id', tagId)
    .eq('organization_id', organizationId);

  if (error) throw new HttpError(500, error.message || 'Failed to delete tag.');
  return { deleted: true };
}

async function loadConversation(organizationId, conversationId) {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('id, organization_id, metadata')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message || 'Failed to load conversation.');
  if (!data) throw new HttpError(404, 'Conversation not found.');
  return data;
}

export async function getConversationTags(organizationId, conversationId) {
  assertUuid(conversationId, 'conversationId');

  const { data, error } = await supabaseAdmin
    .from('conversation_tags')
    .select('tag_id, created_at, tag_definitions(id, name, color)')
    .eq('conversation_id', conversationId)
    .eq('organization_id', organizationId);

  if (error) {
    if (isMissingTagsTable(error)) {
      throw new HttpError(503, 'Tags are not available. Apply database migrations.');
    }
    throw new HttpError(500, error.message || 'Failed to load conversation tags.');
  }

  const tags = (data ?? [])
    .map((row) => row.tag_definitions)
    .filter(Boolean);

  return { tags };
}

/**
 * Replace conversation tag set; syncs `conversations.metadata.tags` for inbox filters.
 */
export async function setConversationTags({
  organizationId,
  conversationId,
  actorUserId,
  tagIds,
}) {
  await ensureOrgMembership(actorUserId, organizationId);
  assertUuid(conversationId, 'conversationId');

  if (!Array.isArray(tagIds)) {
    throw new HttpError(400, 'tagIds must be an array of UUIDs.');
  }
  if (tagIds.length > MAX_TAGS_PER_CONVERSATION) {
    throw new HttpError(400, `At most ${MAX_TAGS_PER_CONVERSATION} tags per conversation.`);
  }

  const normalizedIds = [...new Set(tagIds.map((id) => assertUuid(id, 'tagId')))];

  await loadConversation(organizationId, conversationId);

  if (normalizedIds.length > 0) {
    const { data: defs, error: defErr } = await supabaseAdmin
      .from('tag_definitions')
      .select('id, name')
      .eq('organization_id', organizationId)
      .in('id', normalizedIds);

    if (defErr) throw new HttpError(500, defErr.message || 'Failed to validate tags.');
    if ((defs ?? []).length !== normalizedIds.length) {
      throw new HttpError(400, 'One or more tagIds are invalid for this organization.');
    }
  }

  const { error: delErr } = await supabaseAdmin
    .from('conversation_tags')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('organization_id', organizationId);

  if (delErr) throw new HttpError(500, delErr.message || 'Failed to clear conversation tags.');

  if (normalizedIds.length > 0) {
    const rows = normalizedIds.map((tagId) => ({
      conversation_id: conversationId,
      tag_id: tagId,
      organization_id: organizationId,
    }));
    const { error: insErr } = await supabaseAdmin.from('conversation_tags').insert(rows);
    if (insErr) throw new HttpError(500, insErr.message || 'Failed to assign conversation tags.');
  }

  const { tags } = await getConversationTags(organizationId, conversationId);
  const tagNames = tags.map((t) => t.name);

  const conv = await loadConversation(organizationId, conversationId);
  const meta = conv.metadata && typeof conv.metadata === 'object' ? { ...conv.metadata } : {};
  meta.tags = tagNames;

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('conversations')
    .update({ metadata: meta })
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .select('*')
    .single();

  if (updErr) throw new HttpError(500, updErr.message || 'Failed to sync conversation metadata.');

  return { tags, conversation: updated };
}
