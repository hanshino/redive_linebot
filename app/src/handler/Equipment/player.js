const EquipmentService = require("../../service/EquipmentService");
const MinigameService = require("../../service/MinigameService");

exports.getAvailableEquipment = async (req, res) => {
  try {
    const userId = req.profile.userId;
    const levelData = await MinigameService.findByUserId(userId);
    const jobId = levelData ? levelData.job_id : null;
    const equipment = await EquipmentService.findAvailableForJob(jobId);
    res.json(equipment);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getMyEquipment = async (req, res) => {
  try {
    const userId = req.profile.userId;
    const equipped = await EquipmentService.getPlayerEquipment(userId);
    const bonuses = await EquipmentService.getEquipmentBonuses(userId);
    res.json({ equipped, bonuses });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.equip = async (req, res) => {
  try {
    const userId = req.profile.userId;
    const { equipment_id } = req.body;

    // Get player's job for restriction check
    const levelData = await MinigameService.findByUserId(userId);
    const jobId = levelData ? levelData.job_id : null;

    const result = await EquipmentService.equip(userId, equipment_id, jobId);
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

exports.unequip = async (req, res) => {
  try {
    const userId = req.profile.userId;
    const { slot } = req.body;
    await EquipmentService.unequip(userId, slot);
    res.json({});
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};
