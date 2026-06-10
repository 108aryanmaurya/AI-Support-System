import { HttpError } from '../utils/httpError.js';
import {
  advancedSearch,
  parseAdvancedSearchRequest,
} from '../services/search/advancedSearch.service.js';
import {
  parseStructuredSearchRequest,
  structuredSearch,
} from '../services/search/structuredSearch.service.js';

function orgIdOrThrow(req) {
  const id = req.orgId ?? req.organizationId;
  if (!id) throw new HttpError(500, 'Organization scope missing (middleware misconfigured).');
  return id;
}

export async function searchWorkspaceController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const criteria = parseStructuredSearchRequest(req.query);
    const result = await structuredSearch({
      organizationId,
      membership: req.orgMembership,
      orgPermissions: req.orgPermissions,
      criteria,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function advancedSearchController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const criteria = parseAdvancedSearchRequest(req.body, req.orgMembership.id);
    const result = await advancedSearch({
      organizationId,
      membership: req.orgMembership,
      orgPermissions: req.orgPermissions,
      criteria,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}
        