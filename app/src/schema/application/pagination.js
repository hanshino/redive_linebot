module.exports = {
  type: "object",
  properties: {
    page: {
      type: "string",
      pattern: "^[1-9][0-9]{0,}$",
    },
    per_page: {
      type: "string",
      pattern: "^[0-9]{1,3}$",
    },
    order: {
      type: "string",
      enum: ["asc", "desc"],
    },
    order_by: {
      type: "string",
    },
  },
};
