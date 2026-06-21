const WorldBossCombatService = require("../../service/WorldBossCombatService");
const WorldBossBroadcastService = require("../../service/WorldBossBroadcastService");
const WorldBossReportService = require("../../service/WorldBossReportService");
const WorldBossRoleService = require("../../service/WorldBossRoleService");
const EquipmentService = require("../../service/EquipmentService");
const MinigameService = require("../../service/MinigameService");
const UserModel = require("../../model/application/UserModel");
const WorldBossEvent = require("../../model/application/WorldBossEvent");

// Resolve the combat caller context shared by every action handler.
// platformId -> numericUserId(=user.id) + chat/minigame level (level drives damage, GC#6).
// IMPORTANT (addendum §4): numericUserId MUST be user.id (UserModel.getId), NOT minigame_level.id.
// world_boss_event_log.user_id stores user.id, and settlement JOINs user_id = user.id.
async function resolveCombatContext(platformId) {
  const event = await WorldBossEvent.getActive();
  if (!event) return { event: null, numericUserId: null, level: 1 };
  const [numericUserId, minigame] = await Promise.all([
    UserModel.getId(platformId), // user.id (the settlement FK) — NOT minigame.id
    MinigameService.findByUserId(platformId), // level source ONLY
  ]);
  return {
    event,
    numericUserId, // user.id or null
    level: minigame ? minigame.level : 1,
  };
}

exports.getSnapshot = async (req, res) => {
  try {
    const event = await WorldBossEvent.getActive();
    if (!event) return res.json({ active: false });
    const snapshot = await WorldBossBroadcastService.buildSnapshot(event.id);
    res.json(snapshot);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getMe = async (req, res) => {
  try {
    const platformId = req.profile.userId;
    const { event, numericUserId, level } = await resolveCombatContext(platformId);
    const role = await WorldBossRoleService.getRole(platformId);
    res.json({
      active: !!event,
      eventId: event ? event.id : null,
      role,
      numericUserId,
      level,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Shared runner for the four combat actions.
function makeCombatHandler(method, buildArgs) {
  return async (req, res) => {
    try {
      const platformId = req.profile.userId;
      const { event, numericUserId, level } = await resolveCombatContext(platformId);
      if (!event) return res.status(409).json({ rejected: true, reason: "no_active_boss" });
      if (numericUserId === null) {
        // no user row -> refuse rather than write a bad world_boss_event_log.user_id FK
        return res.status(409).json({ rejected: true, reason: "no_user" });
      }

      const result = await WorldBossCombatService[method](
        buildArgs({ platformId, numericUserId, eventId: event.id, level, body: req.body || {} })
      );

      if (result.rejected) {
        return res.status(409).json({ rejected: true, reason: result.reason });
      }

      WorldBossBroadcastService.requestBroadcast(event.id);
      if (result.didEnrageTrigger) {
        // knockedBatch is already platform_id-mapped by the combat service (addendum §4)
        WorldBossBroadcastService.emitEnrage(event.id, result.knockedBatch || []);
      }
      res.json(result);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  };
}

exports.attack = makeCombatHandler(
  "dpsAttack",
  ({ platformId, numericUserId, eventId, level, body }) => ({
    platformId,
    numericUserId,
    eventId,
    attackType: body.attackType || "normal",
    level,
  })
);

exports.block = makeCombatHandler("tankBlock", ({ platformId, numericUserId, eventId }) => ({
  platformId,
  numericUserId,
  eventId,
}));

exports.revive = makeCombatHandler("healerRevive", ({ platformId, numericUserId, eventId }) => ({
  platformId,
  numericUserId,
  eventId,
}));

exports.shield = makeCombatHandler("healerShield", ({ platformId, numericUserId, eventId }) => ({
  platformId,
  numericUserId,
  eventId,
}));

exports.role = async (req, res) => {
  try {
    const platformId = req.profile.userId;
    const { role, reselect } = req.body || {};
    const result = reselect
      ? await WorldBossRoleService.reselectRole(platformId, role)
      : await WorldBossRoleService.chooseRole(platformId, role);
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

exports.enhance = async (req, res) => {
  try {
    const platformId = req.profile.userId;
    const { equipment_id } = req.body || {};
    const result = await EquipmentService.enhanceEquipment(platformId, equipment_id);
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

exports.getReport = async (req, res) => {
  try {
    const platformId = req.profile.userId;
    const report = await WorldBossReportService.getUnreadReport(platformId);
    res.json(report);
    if (report.hasReport) {
      await WorldBossReportService.markDelivered(platformId);
    }
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
