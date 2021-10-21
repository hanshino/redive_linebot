const redis = require("redis");
const redisClient = redis.createClient(process.env.REDIS_PORT, process.env.REDIS_HOST, {
  password: process.env.REDIS_PASSWORD,
});

redisClient.on("error", console.error);

exports.get = key => {
  return new Promise((res, rej) => {
    redisClient.get(key, function (err, results) {
      if (err) rej(err);
      try {
        let result = JSON.parse(results);
        res(result);
      } catch (e) {
        res(results);
      }
    });
  });
};

exports.set = (key, value, expireTime = 0) => {
  return new Promise((res, rej) => {
    let write = "";
    if (typeof value === "object") {
      write = JSON.stringify(value);
    } else {
      write = value;
    }

    if (expireTime !== 0) {
      redisClient.set(key, write, "EX", expireTime, cb);
    } else {
      redisClient.set(key, write, cb);
    }

    function cb(err, results) {
      if (err) rej(err);
      res(results);
    }
  });
};

exports.del = key => {
  redisClient.del(key);
};

exports.incr = key => {
  return new Promise((res, rej) => {
    redisClient.incr(key, function (err, result) {
      if (err) rej(err);
      redisClient.expire(key, 10 * 60);
      res(result);
    });
  });
};

/**
 * 搶旗
 * @param {String} key
 */
exports.setnx = (key, value, expire = 600) => {
  return new Promise((res, rej) => {
    redisClient.SETNX(key, value, function (err, reply) {
      if (err) rej(err);
      if (reply === 0) {
        res(false);
      } else {
        redisClient.expire(key, expire);
        res(true);
      }
    });
  });
};

exports.expire = (key, seconds) => {
  return new Promise((res, rej) => {
    redisClient.expire(key, seconds, function (err, reply) {
      handlePromise(res, rej, err, reply);
    });
  });
};

exports.mget = keys => {
  return new Promise((res, rej) => {
    redisClient.mget(keys, function (err, reply) {
      handlePromise(res, rej, err, reply);
    });
  });
};

exports.keys = regex => {
  return new Promise((res, rej) => {
    redisClient.keys(regex, function (err, reply) {
      handlePromise(res, rej, err, reply);
    });
  });
};

/**
 * 利用LPUSH特性，達到enQ效果
 * @param {string} key
 * @param {string} strData
 * @param {number} intTTL
 */
exports.enqueue = (key, strData, intTTL = 86400) => {
  return new Promise((res, rej) => {
    redisClient.LPUSH(key, strData, err => {
      if (err) rej(err);
      this.expire(key, intTTL)
        .then(() => res())
        .catch(err => rej(err));
    });
  });
};

/**
 * 利用RPOP特性，將enQ的資料進行deQ
 * @param {string} key
 */
exports.dequeue = key => {
  return new Promise((res, rej) => {
    redisClient.RPOP(key, function (err, reply) {
      handlePromise(res, rej, err, reply);
    });
  });
};

function handlePromise(res, rej, err, result) {
  if (err) rej(err);
  res(result);
}
