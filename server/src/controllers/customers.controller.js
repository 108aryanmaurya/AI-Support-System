import { HttpError } from '../utils/httpError.js';
import { findOrCreateCustomer } from '../services/support.service.js';

export async function createOrGetCustomer(req, res, next) {
  try {
    const organizationId = req.orgId ?? req.organizationId;
    if (!organizationId) {
      throw new HttpError(500, 'Organization scope missing (middleware misconfigured).');
    }

    const { email, name, phone, externalId, metadata = {} } = req.body ?? {};

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
