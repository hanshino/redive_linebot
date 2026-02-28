// Global test setup - mock side-effect modules and validation middleware

// Mock Redis client (connects on require)
jest.mock("../src/util/redis", () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  hGet: jest.fn(),
  hSet: jest.fn(),
  hDel: jest.fn(),
  hGetAll: jest.fn(),
  exists: jest.fn(),
  expire: jest.fn(),
  connect: jest.fn(),
  on: jest.fn(),
  quit: jest.fn(),
  isOpen: true,
}));

// Mock connection.js (creates Socket.IO on require)
jest.mock("../src/util/connection", () => ({
  server: require("express")(),
  http: { listen: jest.fn() },
  io: {
    attach: jest.fn(),
    on: jest.fn(),
    emit: jest.fn(),
    use: jest.fn(),
    of: jest.fn().mockReturnValue({ on: jest.fn(), emit: jest.fn(), use: jest.fn() }),
  },
}));

// Mock validation middleware - bypass all auth
jest.mock("../src/middleware/validation", () => ({
  verifyToken: (req, _res, next) => {
    req.profile = { userId: "U" + "a".repeat(32), privilege: 9 };
    next();
  },
  verifyAdmin: (req, _res, next) => {
    req.profile = { ...req.profile, privilege: 9 };
    next();
  },
  verifyPrivilege: () => (_req, _res, next) => next(),
  verifyId: (_id, _res, next) => next(),
  verifyLineGroupId: (_groupId, _res, next) => next(),
  verifyLineUserId: (_userId, _res, next) => next(),
  socketSetProfile: jest.fn(),
  socketVerifyAdmin: jest.fn(),
}));

// Mock MySQL/knex (prevents real DB connection)
function createMockQueryBuilder() {
  const qb = jest.fn(() => qb);
  const chainMethods = [
    "select",
    "from",
    "where",
    "whereIn",
    "whereNot",
    "whereNull",
    "whereNotNull",
    "andWhere",
    "orWhere",
    "join",
    "leftJoin",
    "rightJoin",
    "innerJoin",
    "orderBy",
    "groupBy",
    "having",
    "limit",
    "offset",
    "distinct",
    "column",
    "columns",
    "returning",
    "as",
    "on",
    "onIn",
    "clearSelect",
    "clearWhere",
    "clearOrder",
  ];
  chainMethods.forEach(m => {
    qb[m] = jest.fn().mockReturnValue(qb);
  });
  qb.first = jest.fn().mockResolvedValue(null);
  qb.insert = jest.fn().mockResolvedValue([0]);
  qb.update = jest.fn().mockResolvedValue(0);
  qb.del = jest.fn().mockResolvedValue(0);
  qb.delete = jest.fn().mockResolvedValue(0);
  qb.count = jest.fn().mockResolvedValue([{ "count(*)": 0 }]);
  qb.sum = jest.fn().mockResolvedValue([{ sum: 0 }]);
  qb.max = jest.fn().mockResolvedValue([{ max: null }]);
  qb.min = jest.fn().mockResolvedValue([{ min: null }]);
  qb.avg = jest.fn().mockResolvedValue([{ avg: null }]);
  qb.raw = jest.fn().mockResolvedValue([]);
  qb.transactionProvider = jest.fn().mockReturnValue(jest.fn().mockResolvedValue(qb));
  qb.transaction = jest.fn().mockResolvedValue(qb);
  qb.isCompleted = jest.fn().mockReturnValue(false);
  qb.commit = jest.fn().mockResolvedValue();
  qb.rollback = jest.fn().mockResolvedValue();
  qb.then = undefined; // prevent Promise resolution of the builder itself
  return qb;
}

const mockKnex = createMockQueryBuilder();
jest.mock("../src/util/mysql", () => mockKnex);

// Mock bottender (prevents LINE client initialization)
jest.mock("bottender", () => ({
  getClient: jest.fn(() => ({
    getGroupMemberProfile: jest.fn().mockResolvedValue({ displayName: "TestUser" }),
    getProfile: jest.fn().mockResolvedValue({ displayName: "TestUser", userId: "Utest" }),
    pushMessage: jest.fn().mockResolvedValue({}),
    replyMessage: jest.fn().mockResolvedValue({}),
    getGroupMembersCount: jest.fn().mockResolvedValue(0),
    getGroupMemberIds: jest.fn().mockResolvedValue([]),
  })),
  chain: jest.fn((...fns) => fns),
  withProps: jest.fn(fn => fn),
  Context: jest.fn(),
  LineContext: jest.fn(),
}));

jest.mock("bottender/router", () => ({
  router: jest.fn(routes => routes),
  route: jest.fn(),
  text: jest.fn(() => jest.fn()),
  line: {
    message: jest.fn(),
    follow: jest.fn(),
    unfollow: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
  },
}));

// Mock imgur (prevents external API client creation)
jest.mock("imgur", () => ({
  ImgurClient: jest.fn().mockImplementation(() => ({
    upload: jest.fn().mockResolvedValue({ data: { link: "https://i.imgur.com/test.jpg" } }),
  })),
}));

// Mock SQLite utility (prevents real SQLite file access)
const mockSqliteKnex = createMockQueryBuilder();
jest.mock("../src/util/sqlite", () => () => mockSqliteKnex);

// Mock i18n (prevents locale file loading)
jest.mock("../src/util/i18n", () => ({
  __: jest.fn(key => key),
  __n: jest.fn(key => key),
  setLocale: jest.fn(),
  getLocale: jest.fn().mockReturnValue("zh_tw"),
  configure: jest.fn(),
}));

// Mock Logger (prevents log file creation)
jest.mock("../src/util/Logger", () => ({
  getLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

// Mock discord util (prevents external HTTP calls)
jest.mock("../src/util/discord", () => ({
  webhook: {
    test: jest.fn().mockResolvedValue(true),
    send: jest.fn().mockResolvedValue(true),
  },
}));
