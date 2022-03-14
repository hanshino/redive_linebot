module.exports = {
  add: {
    type: "object",
    properties: {
      code: {
        type: "string",
        minLength: 1,
        maxLength: 10,
      },
      startAt: {
        type: "string",
        format: "date-time",
      },
      endAt: {
        type: "string",
        format: "date-time",
      },
      reward: {
        type: "number",
        minimum: 1,
      },
    },
    required: ["code", "startAt", "endAt", "reward"],
  },
};
