import { HttpError } from '../utils/httpError.js';
import {
  listWidgetInstallations,
  createWidgetInstallation,
  patchWidgetInstallation,
  rotateWidgetInstallationSecret,
  getWidgetInstallationById,
  buildWidgetSnippet,
} from '../services/widget/widgetInstallation.service.js';
import { emitSupportEvent } from '../services/analytics/supportEvents.service.js';

export async function listWidgetInstallationsController(req, res, next) {
  try {
    const installations = await listWidgetInstallations(req.params.orgId);
    res.json({ installations });
  } catch (err) {
    next(err);
  }
}

export async function createWidgetInstallationController(req, res, next) {
  try {
    const { allowedDomains, settings, testMode } = req.body ?? {};
    const { installation, secret } = await createWidgetInstallation({
      organizationId: req.params.orgId,
      allowedDomains: allowedDomains ?? ['localhost'],
      settings,
      testMode: Boolean(testMode),
    });

    emitSupportEvent({
      organizationId: req.params.orgId,
      eventType: 'widget.installation_created',
      entityType: 'widget_installation',
      entityId: installation.id,
      channelType: 'web',
      payload: { widget_key: installation.widget_key },
    });

    res.status(201).json({
      installation,
      secret,
      snippet: buildWidgetSnippet(installation.widget_key),
    });
  } catch (err) {
    next(err);
  }
}

export async function patchWidgetInstallationController(req, res, next) {
  try {
    const installation = await patchWidgetInstallation({
      organizationId: req.params.orgId,
      installationId: req.params.installationId,
      allowedDomains: req.body?.allowedDomains,
      settings: req.body?.settings,
      status: req.body?.status,
    });
    res.json({ installation });
  } catch (err) {
    next(err);
  }
}

export async function rotateWidgetSecretController(req, res, next) {
  try {
    const { secret, widgetKey, installationId } = await rotateWidgetInstallationSecret({
      organizationId: req.params.orgId,
      installationId: req.params.installationId,
      revokeSessions: req.body?.revokeSessions !== false,
    });
    emitSupportEvent({
      organizationId: req.params.orgId,
      eventType: 'widget.secret_rotated',
      entityType: 'widget_installation',
      entityId: installationId,
      channelType: 'web',
      payload: {},
    });
    res.json({ secret, widgetKey, installationId });
  } catch (err) {
    next(err);
  }
}

export async function getWidgetSnippetController(req, res, next) {
  try {
    const installation = await getWidgetInstallationById(
      req.params.orgId,
      req.params.installationId,
    );
    res.json({
      snippet: buildWidgetSnippet(installation.widget_key),
      widgetKey: installation.widget_key,
    });
  } catch (err) {
    next(err);
  }
}
