const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const userAttackSchema = require("../schema/WorldBoss/userAttackMessage.json");
const searchSchema = require("../schema/search.json");
const marketDetailSchema = require("../schema/application/MarketDetail");
const paginationSchema = require("../schema/application/pagination");
const couponSchema = require("../schema/application/commands/coupon");

const ajv = new Ajv();
addFormats(ajv);

ajv.addFormat("userId", /^U[0-9a-f]{32}$/);

ajv.addSchema(userAttackSchema.create, "createUserAttackMessage");
ajv.addSchema(searchSchema, "search");
ajv.addSchema(marketDetailSchema, "marketDetail");
ajv.addSchema(paginationSchema, "pagination");
ajv.addSchema(couponSchema.add, "couponAdd");

/**
 * @return {Ajv}
 */
module.exports = ajv;
