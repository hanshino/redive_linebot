const mockBot = jest.requireMock("../src/lib/bot");
const { router, route, text, line, withProps } = jest.requireActual("../src/lib/bot");
Object.assign(mockBot, { router, route, text, line, withProps });

jest.mock("../src/controller/application/JobController", () => ({
  startSwordmanJobMission: jest.fn(),
  swordmanAttackTarget: jest.fn(),
  startMageChangeJobMission: jest.fn(),
  mageUseElement: jest.fn(),
  startThiefChangeJobMission: jest.fn(),
  thiefSteal: jest.fn(),
}));
jest.mock("../src/controller/application/JankenController", () => ({
  decide: jest.fn(),
  challenge: jest.fn(),
}));
jest.mock("../src/controller/application/OpenaiController", () => ({ recordSession: jest.fn() }));

const JobController = require("../src/controller/application/JobController");
const JankenController = require("../src/controller/application/JankenController");
const { DefaultLogger } = require("../src/util/Logger");
const { HandlePostback } = require("../src/app");

const jobActions = [
  ["startSwordmanChangeJobMission", "startSwordmanJobMission"],
  ["swordmanChangeJobMission", "swordmanAttackTarget"],
  ["startMageChangeJobMission", "startMageChangeJobMission"],
  ["mageChangeJobMission", "mageUseElement"],
  ["startThiefChangeJobMission", "startThiefChangeJobMission"],
  ["thiefChangeJobMission", "thiefSteal"],
];

function context(type, payload) {
  return {
    event: {
      isPayload: true,
      payload: JSON.stringify(payload),
      source: { type, userId: "Ujob" },
    },
    state: { changeJobMission: { job: "swordman", count: 1 } },
    setState: jest.fn(),
    replyText: jest.fn(),
    replyFlex: jest.fn(),
  };
}

async function runPostback(ctx, next) {
  let action = await HandlePostback(ctx, { next });
  while (typeof action === "function") action = await action(ctx, {});
  expect(DefaultLogger.error).not.toHaveBeenCalled();
}

beforeEach(() => jest.clearAllMocks());

describe.each(["user", "group", "room"])("job postbacks in %s sources", type => {
  test.each(jobActions)("%s dispatches only in private chats", async (action, handler) => {
    const payload = { action, element: "fire", id: "target" };
    const ctx = context(type, payload);
    const initialState = JSON.parse(JSON.stringify(ctx.state));
    const next = jest.fn();

    await runPostback(ctx, next);

    for (const [, name] of jobActions) {
      if (type === "user" && name === handler) {
        expect(JobController[name]).toHaveBeenCalledTimes(1);
        expect(JobController[name].mock.calls[0].slice(0, 2)).toEqual([ctx, { payload }]);
      } else {
        expect(JobController[name]).not.toHaveBeenCalled();
      }
    }
    if (type === "user") {
      expect(next).not.toHaveBeenCalled();
    } else {
      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0].slice(0, 2)).toEqual([ctx, {}]);
    }
    expect(ctx.state).toEqual(initialState);
    expect(ctx.setState).not.toHaveBeenCalled();
    expect(ctx.replyText).not.toHaveBeenCalled();
    expect(ctx.replyFlex).not.toHaveBeenCalled();
  });

  test("unmatched postbacks still fall through", async () => {
    const ctx = context(type, { action: "unknown" });
    const next = jest.fn();

    await runPostback(ctx, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0].slice(0, 2)).toEqual([ctx, {}]);
    expect(ctx.replyText).not.toHaveBeenCalled();
    expect(ctx.replyFlex).not.toHaveBeenCalled();
  });

  test("non-job postbacks remain available", async () => {
    const payload = { action: "janken" };
    const ctx = context(type, payload);
    const next = jest.fn();

    await runPostback(ctx, next);

    expect(JankenController.decide).toHaveBeenCalledTimes(1);
    expect(JankenController.decide.mock.calls[0].slice(0, 2)).toEqual([ctx, { payload }]);
    expect(next).not.toHaveBeenCalled();
  });
});
