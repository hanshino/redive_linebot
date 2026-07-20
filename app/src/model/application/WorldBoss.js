const mysql = require("../../util/mysql");
const Base = require("../base");

const TABLE = "world_boss";
const fillable = ["name", "image", "description", "hp_weight"];

class WorldBoss extends Base {}

const model = new WorldBoss({ table: TABLE, fillable });

exports.model = model;

exports.list = async function (trx) {
  const db = trx || mysql;
  return db(TABLE).orderBy("id", "asc");
};

exports.isInUse = async function (id, trx) {
  const db = trx || mysql;
  return Boolean(await db("world_boss_round").where({ world_boss_id: id }).first());
};
