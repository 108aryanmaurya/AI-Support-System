import { supabaseAdmin } from '../../config/supabase.js';
import { HttpError } from '../../utils/httpError.js';
/**
 * @param {string | null | undefined} email
 */
export function isSyntheticWidgetEmail(email) {
  return typeof email === 'string' && email.trim().toLowerCase().endsWith('@widget.invalid');
}

/**
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 */
export function emailsMatchForMerge(a, b) {
  const na = typeof a === 'string' ? a.trim().toLowerCase() : '';
  const nb = typeof b === 'string' ? b.trim().toLowerCase() : '';
  if (!na || !nb) return false;
  if (isSyntheticWidgetEmail(na) || isSyntheticWidgetEmail(nb)) return false;
  return na === nb;
}

async function loadCustomerRow(organizationId, customerId) {
  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message || 'Failed to load customer.');
  return data;
}

async function findCustomerByUserId(organizationId, userId) {
  const uid = typeof userId === 'string' ? userId.trim() : '';
  if (!uid) return null;

  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('user_id', uid)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message || 'Failed to fetch customer by user_id.');
  return data;
}

/**
 * Move web conversations (and related data) from a prior lead customer to the USER customer.
 * Same-browser identify: visitor_token ties the lead thread to the logged-in profile.
 *
 * @returns {Promise<{ merged: boolean, conversationsMoved: number }>}
 */
export async function mergeLeadCustomerIntoUser({
  organizationId,
  fromCustomerId,
  toCustomerId,
}) {
  if (!fromCustomerId || !toCustomerId || fromCustomerId === toCustomerId) {
    return { merged: false, conversationsMoved: 0 };
  }

  const { data: convRows, error: countErr } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('customer_id', fromCustomerId);

  if (countErr) {
    throw new HttpError(500, countErr.message || 'Failed to list conversations for merge.');
  }

  const ids = (convRows ?? []).map((r) => r.id);
  if (ids.length === 0) {
    return { merged: false, conversationsMoved: 0 };
  }

  const { error: moveErr } = await supabaseAdmin
    .from('conversations')
    .update({ customer_id: toCustomerId })
    .eq('organization_id', organizationId)
    .eq('customer_id', fromCustomerId);

  if (moveErr) {
    throw new HttpError(500, moveErr.message || 'Failed to merge conversations onto user customer.');
  }

  return { merged: true, conversationsMoved: ids.length };
}

/**
 * Resolve USER customer for identify and merge prior lead on this visitor (same device).
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {object} params.visitor widget_visitors row (before link)
 * @param {string} params.userId host site user id
 * @param {string | null} params.email
 * @param {string | null} params.name
 * @param {object} params.metadata
 */
export async function resolveUserCustomerForIdentify({
  organizationId,
  visitor,
  userId,
  email,
  name,
  metadata = {},
}) {
  const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
  if (!normalizedUserId) throw new HttpError(400, 'userId is required.');

  const normalizedEmail =
    typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;

  const priorCustomerId = visitor.customer_id || null;
  const priorCustomer = priorCustomerId
    ? await loadCustomerRow(organizationId, priorCustomerId)
    : null;

  let targetCustomer = await findCustomerByUserId(organizationId, normalizedUserId);
  let upgradedInPlace = false;

  if (targetCustomer && priorCustomerId && priorCustomerId !== targetCustomer.id) {
    await mergeLeadCustomerIntoUser({
      organizationId,
      fromCustomerId: priorCustomerId,
      toCustomerId: targetCustomer.id,
    });
  } else if (!targetCustomer && priorCustomer && !priorCustomer.user_id) {
    const canUpgrade =
      emailsMatchForMerge(priorCustomer.email, normalizedEmail) ||
      emailsMatchForMerge(priorCustomer.email, visitor.email);

    if (canUpgrade) {
      const patch = {
        user_id: normalizedUserId,
        customer_type: 'USER',
        metadata: {
          ...(priorCustomer.metadata && typeof priorCustomer.metadata === 'object'
            ? priorCustomer.metadata
            : {}),
          ...metadata,
          merged_from_lead: true,
          identified_at: new Date().toISOString(),
        },
      };
      if (normalizedEmail) patch.email = normalizedEmail;
      if (name) patch.name = name.trim();

      const { data: upgraded, error: upErr } = await supabaseAdmin
        .from('customers')
        .update(patch)
        .eq('id', priorCustomerId)
        .eq('organization_id', organizationId)
        .select('*')
        .single();

      if (upErr) {
        throw new HttpError(500, upErr.message || 'Failed to upgrade lead customer to user.');
      }
      targetCustomer = upgraded;
      upgradedInPlace = true;
    }
  }

  if (!targetCustomer) {
    if (normalizedEmail) {
      const { data: byEmail, error: emailErr } = await supabaseAdmin
        .from('customers')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (emailErr) throw new HttpError(500, emailErr.message || 'Failed to fetch customer by email.');

      if (byEmail) {
        if (byEmail.user_id && byEmail.user_id !== normalizedUserId) {
          throw new HttpError(409, 'Email is already linked to another user.');
        }
        const { data: updated, error: patchErr } = await supabaseAdmin
          .from('customers')
          .update({
            user_id: normalizedUserId,
            customer_type: 'USER',
            name: name?.trim() || byEmail.name,
            metadata: {
              ...(byEmail.metadata && typeof byEmail.metadata === 'object' ? byEmail.metadata : {}),
              ...metadata,
            },
          })
          .eq('id', byEmail.id)
          .eq('organization_id', organizationId)
          .select('*')
          .single();

        if (patchErr) {
          throw new HttpError(500, patchErr.message || 'Failed to link email customer to user_id.');
        }
        targetCustomer = updated;
        if (priorCustomerId && priorCustomerId !== targetCustomer.id) {
          await mergeLeadCustomerIntoUser({
            organizationId,
            fromCustomerId: priorCustomerId,
            toCustomerId: targetCustomer.id,
          });
        }
      }
    }
  }

  if (!targetCustomer) {
    const insertRow = {
      organization_id: organizationId,
      email: normalizedEmail,
      name: name?.trim() || null,
      customer_type: 'USER',
      user_id: normalizedUserId,
      metadata: {
        ...metadata,
        widget_visitor_id: visitor.id,
      },
    };

    const { data: created, error: createErr } = await supabaseAdmin
      .from('customers')
      .insert(insertRow)
      .select('*')
      .single();

    if (createErr) {
      if (createErr.code === '23505') {
        targetCustomer = await findCustomerByUserId(organizationId, normalizedUserId);
      }
      if (!targetCustomer) {
        throw new HttpError(500, createErr.message || 'Failed to create user customer.');
      }
    } else {
      targetCustomer = created;
    }

    if (
      priorCustomerId &&
      priorCustomerId !== targetCustomer.id &&
      !upgradedInPlace
    ) {
      await mergeLeadCustomerIntoUser({
        organizationId,
        fromCustomerId: priorCustomerId,
        toCustomerId: targetCustomer.id,
      });
    }
  }

  if (
    priorCustomerId &&
    priorCustomerId !== targetCustomer.id &&
    isSyntheticWidgetEmail(priorCustomer?.email) &&
    !upgradedInPlace
  ) {
    await mergeLeadCustomerIntoUser({
      organizationId,
      fromCustomerId: priorCustomerId,
      toCustomerId: targetCustomer.id,
    });
  }

  return {
    customer: targetCustomer,
    priorCustomerId,
    merged:
      Boolean(priorCustomerId) &&
      priorCustomerId !== targetCustomer.id &&
      !upgradedInPlace,
    upgradedInPlace,
  };
}
