const EquipmentService = require("../../service/EquipmentService");

exports.getAvailableEquipment = async (req, res) => {
  try {
    const userId = req.profile.userId;
    const equipment = await EquipmentService.getInventory(userId);
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

    const result = await EquipmentService.equip(userId, equipment_id);
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
