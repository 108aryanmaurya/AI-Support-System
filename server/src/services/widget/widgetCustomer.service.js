import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';
import { findOrCreateCustomer } from '../support.service.js';
import { linkVisitorToCustomer } from './widgetVisitor.service.js';
import { syntheticVisitorEmail } from '../../utils/widgetCrypto.js';

async function loadCustomer(organizationId, customerId) {
  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message || 'Failed to load customer.');
  if (!data) throw new HttpError(400, 'Linked customer not found.');
  return data;
}

/**
 * Resolve customer for visitor — synthetic email for anonymous leads.
 * @param {object} params
 */
export async function ensureVisitorCustomer({
  organizationId,
  visitor,
  email = null,
  name = null,
  userId = null,
  customerType = 'LEAD',
}) {
  if (visitor.customer_id) {
    const customer = await loadCustomer(organizationId, visitor.customer_id);
    return { customerId: customer.id, customer, visitor };
  }

  const normalizedEmail =
    typeof email === 'string' && email.trim()
      ? email.trim().toLowerCase()
      : syntheticVisitorEmail(visitor.id);

  const { customer } = await findOrCreateCustomer({
    organizationId,
    email: normalizedEmail,
    name: name || null,
    userId: userId || null,
    customerType: userId ? 'USER' : customerType,
    metadata: { widget_visitor_id: visitor.id, synthetic_email: !email },
  });

  const updatedVisitor = await linkVisitorToCustomer(visitor.id, customer.id, {
    email: typeof email === 'string' ? email : null,
    name,
  });

  return { customerId: customer.id, customer, visitor: updatedVisitor };
}
