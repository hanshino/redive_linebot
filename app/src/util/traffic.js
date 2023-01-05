const redis = require("./redis");

exports.recordSign = sign => {
  redis.incr(`SignRecord_${sign}`, { EX: 86400 });
};

exports.recordPeople = context => {
  let { userId } = context.event.source;
  let current = getDate();
  let speakKey = `SpeakTimes_${current}`;
  let onlineKey = `OnlinePeople_${current}`;
  let personKey = `PersonTraffic_${userId}_${current}`;

  redis.incr(speakKey, { EX: 86400 });

  redis.set(personKey, 1, { NX: true, EX: 86400 }).then(res => {
    if (res) {
      redis.incr(onlineKey, { EX: 86400 });
    } else {
      redis.incr(personKey, { EX: 86400 });
    }
  });
};

exports.getSignData = () => {
  return redis.keys("SignRecord_*").then(keys => redis.mGet(keys));
};

exports.getPeopleData = async () => {
  let curr = new Date().getTime();
  let lastOne = getDate(new Date(curr - 60 * 1000));
  let lastTwo = getDate(new Date(curr - 120 * 1000));

  return Promise.all([getDate(new Date(curr)), lastOne, lastTwo].map(date => getPeopleData(date)));
};

function getPeopleData(date) {
  return Promise.all([redis.get(`OnlinePeople_${date}`), redis.get(`SpeakTimes_${date}`)]).then(
    results => ({
      onlineCount: results[0] || 0,
      speakTimes: results[1] || 0,
    })
  );
}

function getDate(time) {
  time = time || new Date();
  return [
    time.getFullYear(),
    time.getMonth(),
    time.getDate(),
    time.getHours(),
    time.getMinutes(),
  ].join("");
}
