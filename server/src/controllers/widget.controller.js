import { mergeWidgetSettings } from '@ai-support/shared';
import { widgetConfig } from '../config/widget.config.js';
import { HttpError } from '../utils/httpError.js';
import { isDomainAllowed, parseRequestHostname } from '../services/widget/widgetDomain.service.js';
import { getWidgetInstallationByKey } from '../services/widget/widgetInstallation.service.js';
import { findOrCreateVisitor } from '../services/widget/widgetVisitor.service.js';
import {
  createWidgetSession,
  refreshWidgetSession,
} from '../services/widget/widgetSession.service.js';
import {
  listVisitorConversations,
  createVisitorConversation,
  getVisitorConversation,
} from '../services/widget/widgetConversation.service.js';
import {
  listConversationMessages,
  sendWidgetMessage,
  submitPreChat,
} from '../services/widget/widgetMessage.service.js';
import { identifyWidgetVisitor } from '../services/widget/widgetIdentify.service.js';
import {
  ensureVisitorCustomer,
  getVisitorIdentificationState,
  formatWidgetVisitor,
} from '../services/widget/widgetCustomer.service.js';
import { emitSupportEvent } from '../services/analytics/supportEvents.service.js';

function logWidget(event, fields) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ event, ...fields, ts: new Date().toISOString() }));
}

export async function widgetBootstrapController(req, res, next) {
  try {
    const widgetKey = typeof req.query.widget_key === 'string' ? req.query.widget_key.trim() : '';
    const visitorToken =
      typeof req.query.visitor_token === 'string' ? req.query.visitor_token.trim() : null;
    const userJwt =
      typeof req.query.user_jwt === 'string' ? req.query.user_jwt.trim() : null;

    if (!widgetKey) throw new HttpError(400, 'widget_key is required.');

    const installation = await getWidgetInstallationByKey(widgetKey);
    if (!installation || installation.status !== 'active') {
      throw new HttpError(404, 'Widget not found.');
    }

    const hostname = parseRequestHostname(req.headers.origin, req.headers.referer);
    if (!isDomainAllowed(installation.allowed_domains, hostname)) {
      logWidget('widget.domain_rejected', {
        organization_id: installation.organization_id,
        installation_id: installation.id,
        hostname,
      });
      throw new HttpError(403, 'Origin not allowed for this widget.');
    }

    let { visitor, visitorToken: token } = await findOrCreateVisitor({
      installation,
      visitorToken,
      ip: req.ip,
    });

    if (userJwt) {
      const identified = await identifyWidgetVisitor({
        installation,
        visitor,
        userJwt,
      });
      visitor = identified.visitor;
    }

    const { sessionToken, expiresAt } = await createWidgetSession({
      visitor,
      installation,
    });

    logWidget('widget.bootstrap', {
      organization_id: installation.organization_id,
      installation_id: installation.id,
      visitor_id: visitor.id,
    });

    emitSupportEvent({
      organizationId: installation.organization_id,
      eventType: 'widget.opened',
      entityType: 'widget_installation',
      entityId: installation.id,
      channelType: 'web',
      payload: { visitor_id: visitor.id },
    });

    const settings = mergeWidgetSettings(installation.settings);
    const { isIdentified } = await getVisitorIdentificationState(
      installation.organization_id,
      visitor,
    );

    res.json({
      visitorToken: token,
      sessionToken,
      expiresAt,
      apiBase: widgetConfig.apiPublicUrl,
      iframeOrigin: widgetConfig.iframeOrigin,
      settings: {
        brandColor: settings.brandColor,
        logoUrl: settings.logoUrl,
        position: settings.position,
        greeting: settings.greeting,
        requireEmail: settings.requireEmail,
        preChatFields: settings.preChatFields,
        showConversationList: settings.showConversationList,
        offlineMessage: settings.offlineMessage,
        privacyUrl: settings.privacyUrl,
        darkMode: settings.darkMode,
      },
      visitor: formatWidgetVisitor(visitor, { isIdentified }),
    });
  } catch (err) {
    next(err);
  }
}

export async function widgetRefreshSessionController(req, res, next) {
  try {
    const refreshed = await refreshWidgetSession({
      session: req.widgetSession,
      visitor: req.widgetVisitor,
      installation: req.widgetInstallation,
    });
    res.json({
      sessionToken: refreshed.sessionToken,
      expiresAt: refreshed.expiresAt,
    });
  } catch (err) {
    next(err);
  }
}

export async function widgetPreChatController(req, res, next) {
  try {
    const email = req.body?.email;
    const name = req.body?.name;
    const visitor = await submitPreChat({
      organizationId: req.widgetInstallation.organization_id,
      visitor: req.widgetVisitor,
      email,
      name,
    });
    res.json({
      visitor: formatWidgetVisitor(visitor, { isIdentified: false }),
    });
  } catch (err) {
    next(err);
  }
}

export async function widgetIdentifyController(req, res, next) {
  try {
    const { userId, email, name, hash, userJwt } = req.body ?? {};
    const result = await identifyWidgetVisitor({
      installation: req.widgetInstallation,
      visitor: req.widgetVisitor,
      userId,
      email,
      name,
      hash,
      userJwt,
    });
    logWidget('widget.identify', {
      organization_id: req.widgetInstallation.organization_id,
      visitor_id: req.widgetVisitor.id,
      customer_id: result.customer.id,
      lead_merged: Boolean(result.merged),
      upgraded_in_place: Boolean(result.upgradedInPlace),
    });
    res.json({
      visitor: formatWidgetVisitor(result.visitor, { isIdentified: true }),
      customerId: result.customer.id,
      merged: Boolean(result.merged),
    });
  } catch (err) {
    next(err);
  }
}

export async function widgetListConversationsController(req, res, next) {
  try {
    const orgId = req.widgetInstallation.organization_id;
    const { customerId, customer } = await ensureVisitorCustomer({
      organizationId: orgId,
      visitor: req.widgetVisitor,
    });
    if (!req.widgetVisitor.customer_id) {
      res.json({ conversations: [] });
      return;
    }
    const conversations = await listVisitorConversations({
      organizationId: orgId,
      customerId,
      limit: Number(req.query.limit) || 20,
      cursor: req.query.cursor || null,
    });
    res.json({ conversations });
  } catch (err) {
    next(err);
  }
}

export async function widgetCreateConversationController(req, res, next) {
  try {
    const orgId = req.widgetInstallation.organization_id;
    const conversation = await createVisitorConversation({
      organizationId: orgId,
      visitor: req.widgetVisitor,
      installation: req.widgetInstallation,
      sessionId: req.widgetSession.id,
      subject: req.body?.subject,
    });
    emitSupportEvent({
      organizationId: orgId,
      eventType: 'widget.conversation_started',
      entityType: 'conversation',
      entityId: conversation.id,
      channelType: 'web',
      payload: { source: 'widget' },
    });
    res.status(201).json({ conversation });
  } catch (err) {
    next(err);
  }
}

export async function widgetListMessagesController(req, res, next) {
  try {
    const orgId = req.widgetInstallation.organization_id;
    const conversationId = req.params.conversationId;
    const { customerId, customer } = await ensureVisitorCustomer({
      organizationId: orgId,
      visitor: req.widgetVisitor,
    });
    const messages = await listConversationMessages({
      organizationId: orgId,
      conversationId,
      customerId,
      customer,
      visitor: req.widgetVisitor,
      session: req.widgetSession,
      since: req.query.since || null,
    });
    res.json({ messages });
  } catch (err) {
    next(err);
  }
}

export async function widgetSendMessageController(req, res, next) {
  try {
    const idempotencyKey =
      req.body?.idempotencyKey ??
      req.headers['x-idempotency-key'] ??
      null;
    const result = await sendWidgetMessage({
      organizationId: req.widgetInstallation.organization_id,
      visitor: req.widgetVisitor,
      installation: req.widgetInstallation,
      sessionId: req.widgetSession.id,
      conversationId: req.params.conversationId || req.body?.conversationId || null,
      content: req.body?.message ?? req.body?.content,
      idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : null,
    });
    logWidget('widget.message_sent', {
      organization_id: req.widgetInstallation.organization_id,
      conversation_id: result.conversationId,
      visitor_id: req.widgetVisitor.id,
    });
    emitSupportEvent({
      organizationId: req.widgetInstallation.organization_id,
      eventType: 'widget.message.sent',
      entityType: 'message',
      entityId: result.message?.id,
      channelType: 'web',
      payload: { conversation_id: result.conversationId, source: 'widget' },
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function widgetTypingController(req, res, next) {
  try {
    const { setWidgetTyping } = await import('../services/widget/widgetTyping.service.js');
    await setWidgetTyping({
      conversationId: req.params.conversationId,
      organizationId: req.widgetInstallation.organization_id,
      visitorId: req.widgetVisitor.id,
      typing: req.body?.typing !== false,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function widgetGetTypingController(req, res, next) {
  try {
    const { getWidgetTyping } = await import('../services/widget/widgetTyping.service.js');
    const agentTyping = await getWidgetTyping(req.params.conversationId);
    res.json({ agentTyping });
  } catch (err) {
    next(err);
  }
}
