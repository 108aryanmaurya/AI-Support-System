import { HttpError } from '../utils/httpError.js';
import {
  createTagDefinition,
  deleteTagDefinition,
  getConversationTags,
  listTagDefinitions,
  patchTagDefinition,
  setConversationTags,
} from '../services/tags.service.js';

function orgIdOrThrow(req) {
  const id = req.orgId ?? req.organizationId;
  if (!id) throw new HttpError(500, 'Organization scope missing (middleware misconfigured).');
  return id;
}

function actorUserIdOrThrow(req) {
  const id = req.userId ?? req.user?.id;
  if (!id) throw new HttpError(401, 'Authentication required.');
  return id;
}

export async function listTagsController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const result = await listTagDefinitions(organizationId);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function createTagController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const actorUserId = actorUserIdOrThrow(req);
    const { name, color } = req.body ?? {};
    const result = await createTagDefinition({ organizationId, actorUserId, name, color });
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}

export async function patchTagController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const tagId = req.params.tagId;
    if (!tagId) throw new HttpError(400, 'tagId is required.');
    const { name, color } = req.body ?? {};
    const result = await patchTagDefinition({ organizationId, tagId, name, color });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function deleteTagController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const tagId = req.params.tagId;
    if (!tagId) throw new HttpError(400, 'tagId is required.');
    const result = await deleteTagDefinition({ organizationId, tagId });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function getConversationTagsController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const conversationId = req.params.conversationId;
    if (!conversationId) throw new HttpError(400, 'conversationId is required.');
    const result = await getConversationTags(organizationId, conversationId);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function setConversationTagsController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const actorUserId = actorUserIdOrThrow(req);
    const conversationId = req.params.conversationId;
    if (!conversationId) throw new HttpError(400, 'conversationId is required.');
    const { tagIds } = req.body ?? {};
    const result = await setConversationTags({
      organizationId,
      conversationId,
      actorUserId,
      tagIds: tagIds ?? [],
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}
