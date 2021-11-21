const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const userAttackSchema = require("../schema/WorldBoss/userAttackMessage.json");
const searchSchema = require("../schema/search.json");

const ajv = new Ajv();
addFormats(ajv);

ajv.addSchema(userAttackSchema.create, "createUserAttackMessage");
ajv.addSchema(searchSchema, "search");

/**
 * @return {Ajv}
 */
module.exports = ajv;
