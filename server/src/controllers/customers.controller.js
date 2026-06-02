import { HttpError } from '../utils/httpError.js';
import { findOrCreateCustomer } from '../services/support.service.js';
import { supabaseAdmin } from '../config/supabase.js';

export async function createOrGetCustomer(req, res, next) {
  try {
    const organizationId = req.orgId ?? req.organizationId;
    if (!organizationId) {
      throw new HttpError(500, 'Organization scope missing (middleware misconfigured).');
    }

    const { email, name, phone, externalId, metadata = {}, type = 'USER', user_id: userIdSnake, userId: userIdCamel } = req.body ?? {};
    const customerType = typeof type === 'string' ? type.trim().toUpperCase() : 'USER';
    if (customerType !== 'USER' && customerType !== 'LEAD') {
      throw new HttpError(400, "type must be either 'USER' or 'LEAD'.");
    }
    const userId = userIdSnake ?? userIdCamel ?? null;
    if (userId != null && typeof userId !== 'string') {
      throw new HttpError(400, 'user_id must be a string when provided.');
    }
    if (customerType === 'USER' && !email && !userId) {
      throw new HttpError(400, 'USER requires at least email or user_id.');
    }
    if (customerType === 'LEAD' && !email) {
      throw new HttpError(400, 'LEAD requires email.');
    }

    const result = await findOrCreateCustomer({
      organizationId,
      email,
      name,
      phone,
      externalId,
      customerType,
      userId,
      metadata,
    });

    res.status(result.created ? 201 : 200).json(result);
  } catch (error) {
    next(error);
  }
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function listCustomersController(req, res, next) {
  try {
    const organizationId = req.orgId ?? req.organizationId;
    if (!organizationId) {
      throw new HttpError(500, 'Organization scope missing (middleware misconfigured).');
    }

    const rawQuery = typeof req.query?.query === 'string' ? req.query.query.trim() : '';
    const limit = Math.min(toInt(req.query?.limit, 50), 200);

    let query = supabaseAdmin
      .from('customers')
      .select('id, email, name, customer_type, user_id')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (rawQuery) {
      const q = rawQuery.replace(/%/g, '\\%').replace(/_/g, '\\_');
      query = query.or(`email.ilike.%${q}%,name.ilike.%${q}%,user_id.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw new HttpError(500, error.message || 'Failed to list customers.');

    res.json({ items: data ?? [] });
  } catch (error) {
    next(error);
  }
}
