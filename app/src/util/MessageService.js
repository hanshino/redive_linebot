const amqp = require("amqplib");

exports.connection = null;
exports.channel = {};
exports.exchange = null;
exports.connectionUri = `amqp://${process.env.AMQP_HOST}`;

/**
 * AMQP關閉連線
 */
exports.close = () => {
  if (this.connection) return this.connection.close();
};

/**
 * AMQP連線
 */
exports.connect = async () => {
  if (this.connection === null) {
    this.connection = await amqp.connect(this.connectionUri);
  }
};

/**
 * 取得佇列物件
 * @param {String} qname 佇列名稱
 * @param {Number} intTTL 保存期限
 * @returns {Promise<queue>}
 */
exports.getQueue = async (qname, intTTL) => {
  if (this.channel[qname]) return this.channel[qname];

  let q = new queue(qname, intTTL);
  let c = await this.connection.createChannel();

  await c.assertQueue(qname, {
    durable: true,
    arguments: {
      "x-expires": intTTL,
    },
  });
  await c.prefetch(1, false);
  q._setChannel(c);

  this.channel[qname] = q;
  return q;
};

class queue {
  /**
   * 實體化一個新的佇列
   * @param {String} qname 佇列名稱
   * @param {Number} intTTL 保存期限
   */
  constructor(qname, intTTL = 30000) {
    this.qname = qname;
    this.intTTL = intTTL;
  }

  _setChannel(channel) {
    this.channel = channel;
    return this;
  }

  /**
   * 加入資料進佇列
   * @param {String} strData 純文字資料
   * @returns {queue} return this for chaining
   */
  async enqueue(strData) {
    await this.channel.sendToQueue(this.qname, Buffer.from(strData), {
      persistent: true,
    });
    return this;
  }

  /**
   * 從佇列取出資料
   * @returns {Promise<String|Boolean>} Message or False
   */
  async dequeue() {
    let msg = await this.channel.get(this.qname);
    if (msg) this.channel.ack(msg);
    return msg ? msg.content.toString() : false;
  }
}
