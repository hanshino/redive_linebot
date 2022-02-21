module.exports = {
  type: "object",
  properties: {
    targetId: {
      type: "string",
      format: "userId",
    },
    itemId: {
      type: "number",
    },
    charge: {
      type: "number",
      minimum: 1,
    },
  },
};
