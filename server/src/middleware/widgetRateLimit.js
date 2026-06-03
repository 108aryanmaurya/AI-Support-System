import { widgetConfig } from '../config/widget.config.js';
import { rateLimitMiddleware } from './rateLimitFactory.js';

const { rateLimits: rl } = widgetConfig;

export const widgetBootstrapRateLimit = rateLimitMiddleware({
  name: 'widget.bootstrap',
  windowMs: rl.bootstrapWindowMs,
  maxRequests: rl.bootstrapMax,
  skipWhenNoKey: true,
  message: 'Too many widget bootstrap requests.',
  getKey: (req) => {
    const key = typeof req.query?.widget_key === 'string' ? req.query.widget_key.trim() : '';
    const ip = req.ip || 'unknown';
    return key ? `widget:bootstrap:${key}:${ip}` : null;
  },
});

export const widgetRefreshRateLimit = rateLimitMiddleware({
  name: 'widget.refresh',
  windowMs: rl.refreshWindowMs,
  maxRequests: rl.refreshMax,
  message: 'Too many session refresh requests.',
  getKey: (req) => {
    const vid = req.widgetVisitor?.id;
    return vid ? `widget:refresh:${vid}` : null;
  },
});

export const widgetMessageVisitorRateLimit = rateLimitMiddleware({
  name: 'widget.msg.visitor',
  windowMs: rl.msgVisitorWindowMs,
  maxRequests: rl.msgVisitorMax,
  message: 'Too many messages.',
  getKey: (req) => {
    const vid = req.widgetVisitor?.id;
    return vid ? `widget:msg:${vid}` : null;
  },
});

export const widgetMessageInstRateLimit = rateLimitMiddleware({
  name: 'widget.msg.inst',
  windowMs: rl.msgInstWindowMs,
  maxRequests: rl.msgInstMax,
  message: 'Too many messages for this widget.',
  getKey: (req) => {
    const inst = req.widgetInstallation?.id;
    return inst ? `widget:msg:inst:${inst}` : null;
  },
});

export const widgetIdentifyRateLimit = rateLimitMiddleware({
  name: 'widget.identify',
  windowMs: rl.identifyWindowMs,
  maxRequests: rl.identifyMax,
  message: 'Too many identify requests.',
  getKey: (req) => {
    const inst = req.widgetInstallation?.id;
    return inst ? `widget:identify:${inst}` : null;
  },
});
