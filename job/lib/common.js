exports.delay = seconds => {
  return new Promise(res => {
    setTimeout(() => {
      res();
    }, seconds * 1000);
  });
};

exports.random = (min, max) => Math.floor(Math.random() * max) + min;
