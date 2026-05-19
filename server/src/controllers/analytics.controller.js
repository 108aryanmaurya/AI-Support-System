import {
  getAnalyticsAi,
  getAnalyticsAiRuns,
  getAnalyticsConversations,
  getAnalyticsKnowledge,
  getAnalyticsOverview,
  getAnalyticsTeam,
} from '../services/analytics/overview.service.js';

export async function analyticsOverviewController(req, res, next) {
  try {
    const data = await getAnalyticsOverview(req.organizationId, req.query);
    res.json(data);
  } catch (e) {
    next(e);
  }
}

export async function analyticsConversationsController(req, res, next) {
  try {
    const data = await getAnalyticsConversations(req.organizationId, req.query);
    res.json(data);
  } catch (e) {
    next(e);
  }
}

export async function analyticsTeamController(req, res, next) {
  try {
    const data = await getAnalyticsTeam(
      req.organizationId,
      req.query,
      req.orgMembership,
    );
    res.json(data);
  } catch (e) {
    next(e);
  }
}

export async function analyticsAiController(req, res, next) {
  try {
    const data = await getAnalyticsAi(req.organizationId, req.query);
    res.json(data);
  } catch (e) {
    next(e);
  }
}

export async function analyticsKnowledgeController(req, res, next) {
  try {
    const data = await getAnalyticsKnowledge(req.organizationId, req.query);
    res.json(data);
  } catch (e) {
    next(e);
  }
}

export async function analyticsAiRunsController(req, res, next) {
  try {
    const data = await getAnalyticsAiRuns(req.organizationId, req.query);
    res.json(data);
  } catch (e) {
    next(e);
  }
}
