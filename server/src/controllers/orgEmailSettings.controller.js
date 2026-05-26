import { HttpError } from '../utils/httpError.js';
import {
  confirmOrgEmailForwarding,
  deleteOrgEmailSettings,
  getOrgEmailSettings,
  patchOrgEmailAddresses,
  startOrgEmailDomainSetup,
  startOrgEmailForwarding,
  startOrgEmailSendingDomain,
  verifyOrgEmailDomain,
} from '../services/orgEmailSettings.service.js';

function orgIdOrThrow(req) {
  const id = req.orgId ?? req.organizationId;
  if (!id) throw new HttpError(500, 'Organization scope missing (middleware misconfigured).');
  return id;
}

export async function getOrgEmailSettingsController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const settings = await getOrgEmailSettings(organizationId);
    const role = String(req.orgRole ?? '').toUpperCase();
    res.json({
      ...settings,
      canEdit: role === 'ADMIN',
    });
  } catch (error) {
    next(error);
  }
}

export async function postOrgEmailForwardingController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const settings = await startOrgEmailForwarding(organizationId, {
      displaySupportEmail: req.body?.displaySupportEmail,
    });
    res.status(201).json(settings);
  } catch (error) {
    next(error);
  }
}

export async function postOrgEmailForwardingConfirmController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const settings = await confirmOrgEmailForwarding(organizationId);
    res.json(settings);
  } catch (error) {
    next(error);
  }
}

export async function postOrgEmailSendingDomainController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const settings = await startOrgEmailSendingDomain(organizationId, {
      subdomain: req.body?.subdomain,
    });
    res.status(201).json(settings);
  } catch (error) {
    next(error);
  }
}

export async function postOrgEmailDomainController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const setupMode = req.body?.setupMode;
    const settings =
      setupMode === 'dns'
        ? await startOrgEmailDomainSetup(organizationId, { subdomain: req.body?.subdomain })
        : await startOrgEmailSendingDomain(organizationId, { subdomain: req.body?.subdomain });
    res.status(201).json(settings);
  } catch (error) {
    next(error);
  }
}

export async function postOrgEmailDomainVerifyController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const settings = await verifyOrgEmailDomain(organizationId);
    res.json(settings);
  } catch (error) {
    next(error);
  }
}

export async function patchOrgEmailAddressesController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const settings = await patchOrgEmailAddresses(organizationId, req.body ?? {});
    res.json(settings);
  } catch (error) {
    next(error);
  }
}

export async function deleteOrgEmailSettingsController(req, res, next) {
  try {
    const organizationId = orgIdOrThrow(req);
    const result = await deleteOrgEmailSettings(organizationId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
