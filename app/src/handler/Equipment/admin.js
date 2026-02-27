const EquipmentService = require("../../service/EquipmentService");
const i18n = require("../../util/i18n");

exports.getAllEquipment = async (req, res) => {
  const equipment = await EquipmentService.all({
    sort: [{ column: "created_at", order: "desc" }],
  });
  res.json(equipment);
};

exports.getEquipmentById = async (req, res) => {
  const equipment = await EquipmentService.find(req.params.id);
  res.json(equipment);
};

exports.storeEquipment = async (req, res) => {
  try {
    await EquipmentService.create(req.body);
    res.json({});
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

exports.updateEquipment = async (req, res) => {
  try {
    await EquipmentService.update(req.params.id, req.body);
    res.json({});
  } catch (e) {
    res.status(500).json({ message: i18n.t("api.error.unknown") });
  }
};

exports.deleteEquipment = async (req, res) => {
  try {
    await EquipmentService.destroy(req.params.id);
    res.json({});
  } catch (e) {
    res.status(500).json({ message: i18n.t("api.error.unknown") });
  }
};
