// eslint-disable-next-line no-unused-vars
const { Context, getClient } = require("bottender");
const { text } = require("bottender/router");
const { get } = require("lodash");
const redis = require("../../util/redis");
const AchievementEngine = require("../../service/AchievementEngine");
const UserTitleModel = require("../../model/application/UserTitle");
const UserAchievementModel = require("../../model/application/UserAchievement");
const AchievementTemplate = require("../../templates/application/Achievement");

const lineClient = getClient("line");
const RANKING_CACHE_KEY = "AchievementRanking_v1";
const RANKING_CACHE_TTL = 60 * 60;

exports.router = [text(/^[.#/](成就|achievement|adv)$/, showAchievements)];

exports.titleRouter = [text(/^[.#/](稱號|title)$/, showTitles)];

exports.adminRouter = [];

async function showAchievements(context) {
  const { userId } = context.event.source;
  const summary = await AchievementEngine.getUserSummary(userId);

  if (summary.unlocked === 0 && summary.nearCompletion.length === 0) {
    return context.replyText(AchievementTemplate.generateNoDataText());
  }

  const flex = AchievementTemplate.generateSummaryFlex(summary);
  return context.replyFlex("成就系統", flex);
}

async function showTitles(context) {
  const { userId } = context.event.source;
  const titles = await UserTitleModel.findByUser(userId);

  if (titles.length === 0) {
    return context.replyText(AchievementTemplate.generateNoTitlesText());
  }

  const flex = AchievementTemplate.generateTitlesFlex(titles);
  return context.replyFlex("我的稱號", flex);
}

exports.api = {
  async getAll(req, res) {
    try {
      const AchievementModel = require("../../model/application/Achievement");
      const achievements = await AchievementModel.allWithCategories();
      res.json(achievements);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },

  async getUserAchievements(req, res) {
    try {
      const { userId } = req.params;
      const summary = await AchievementEngine.getUserSummary(userId);
      res.json(summary);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },

  async getStats(req, res) {
    try {
      const stats = await AchievementEngine.getStats();
      res.json(stats);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },

  async getUserTitles(req, res) {
    try {
      const { userId } = req.params;
      const titles = await UserTitleModel.findByUser(userId);
      res.json(titles);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },

  async getRanking(req, res) {
    try {
      const cached = await redis.get(RANKING_CACHE_KEY);
      if (cached) return res.json(JSON.parse(cached));

      const rankData = await UserAchievementModel.getUnlockRank({ limit: 10 });
      const result = await Promise.all(
        rankData.map(async (data, index) => {
          const profile = await lineClient.getUserProfile(data.user_id).catch(() => null);
          const displayName = get(profile, "displayName", `未知${index + 1}`);
          return { ...data, displayName };
        })
      );
      redis.set(RANKING_CACHE_KEY, JSON.stringify(result), { EX: RANKING_CACHE_TTL });
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
};
