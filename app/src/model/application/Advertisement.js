const mysql = require("../../util/mysql");
const { pick } = require("lodash");
const TABLE = "ad_message";

exports.create = attributes => {
  attributes = pick(attributes, ["message", "title", "sender_name", "sender_iconUrl"]);
  return mysql(TABLE).insert(attributes);
};

exports.find = async id => {
  return await mysql.select("*").from(TABLE).where({ id });
};

exports.findLatestByTitle = async title => {
  return await mysql.from(TABLE).where({ title }).orderBy("created_at", "desc").first("*");
};
