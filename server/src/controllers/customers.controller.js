import { HttpError } from '../utils/httpError.js';
import { ensureOrgMembership, findOrCreateCustomer } from '../services/support.service.js';

export async function createOrGetCustomer(req, res, next) {
  try {
    const { organizationId, email, name, phone, externalId, metadata = {} } = req.body ?? {};
    if (!organizationId) {
      throw new HttpError(400, 'organizationId is required.');
    }

    await ensureOrgMembership(req.user.id, organizationId);
    const result = await findOrCreateCustomer({
      organizationId,
      email,
      name,
      phone,
      externalId,
      metadata,
    });

    res.status(result.created ? 201 : 200).json(result);
  } catch (error) {
    next(error);
  }
}
