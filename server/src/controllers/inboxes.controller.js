import { HttpError } from '../utils/httpError.js';
import { listAccessibleInboxIds } from '../services/inboxAccess.service.js';
import {
  createInbox,
  listInboxMembers,
  listInboxes,
  patchInbox,
  replaceInboxMembers,
} from '../services/inboxes.service.js';

function orgIdOrThrow(req) {
  const id = req.orgId ?? req.organizationId;
  if (!id) throw new HttpError(500, 'Organization scope missing (middleware misconfigured).');
  return id;
}

export async function listInboxesController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const { inboxIds, viewAll } = await listAccessibleInboxIds({
      organizationId,
      membership: req.orgMembership,
      orgPermissions: req.orgPermissions,
    });

    const inboxes = await listInboxes(organizationId, {
      accessibleInboxIds: inboxIds,
      viewAll,
    });
    res.json({ inboxes });
  } catch (error) {
    next(error);
  }
}

export async function createInboxController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const { name, memberIds = [], settings } = req.body ?? {};
    const inbox = await createInbox({ organizationId, name, memberIds, settings });
    res.status(201).json({ inbox });
  } catch (error) {
    next(error);
  }
}

export async function patchInboxController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const inboxId = req.params.inboxId;
    const { name, status, settings } = req.body ?? {};
    const inbox = await patchInbox({ organizationId, inboxId, name, status, settings });
    res.json({ inbox });
  } catch (error) {
    next(error);
  }
}

export async function listInboxMembersController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const inboxId = req.params.inboxId;
    const members = await listInboxMembers(organizationId, inboxId);
    res.json({ members });
  } catch (error) {
    next(error);
  }
}

export async function replaceInboxMembersController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const inboxId = req.params.inboxId;
    const { memberIds = [], memberRoles = {}, memberPermissions = {} } = req.body ?? {};
    if (!Array.isArray(memberIds)) {
      throw new HttpError(400, 'memberIds must be an array.');
    }
    await replaceInboxMembers({ organizationId, inboxId, memberIds, memberRoles, memberPermissions });
    const members = await listInboxMembers(organizationId, inboxId);
    res.json({ members });
  } catch (error) {
    next(error);
  }
}
