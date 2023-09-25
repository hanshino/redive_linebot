// eslint-disable-next-line no-unused-vars
const { LineContext } = require("bottender");
const { text } = require("bottender/router");
const VoteModel = require("../../model/application/Vote");
const VoteUserDecisionModel = require("../../model/application/VoteUserDecision");
const i18n = require("../../util/i18n");
const VoteTemplate = require("../../templates/application/Vote");
const redis = require("../../util/redis");
const config = require("config");
const moment = require("moment");
const { DefaultLogger } = require("../../util/Logger");
const { get, chunk } = require("lodash");
const minimist = require("minimist");

exports.router = [
  text(/^[.#/](投票) (?<voteId>\d+)$/, show),
  text(/^[.#/](vote) list/, commandShowVote),
];

/**
 * 利用 /vote 命令顯示投票
 * @param {LineContext} context
 */
async function commandShowVote(context) {
  const args = minimist(context.event.message.text.split(" "));

  if (args.h || args.help) {
    return context.quoteReply(i18n.__("message.vote.help"));
  }

  const ids = get(args, "ids", "").split(",");
  if (ids.length === 0) {
    return context.quoteReply(i18n.__("message.vote.help"));
  }

  const votes = await VoteModel.getAllById(ids);
  if (votes.length === 0) {
    return context.quoteReply(i18n.__("message.vote.notFound"));
  }

  const voteList = votes.map(vote => VoteTemplate.generateVote(vote));
  chunk(voteList, 12).forEach(voteListChunk => {
    context.replyFlex("投票列表", {
      type: "carousel",
      contents: voteListChunk,
    });
  });
}

/**
 * 顯示投票
 * @param {LineContext} context
 */
async function show(context, props) {
  const { voteId } = props.match.groups;

  const vote = await VoteModel.find(voteId);

  if (!vote) {
    return context.quoteReply(i18n.__("message.vote.notFound"));
  }

  // 檢查是否在舉辦時間內
  const isHolding = await getIsHolding(voteId);
  if (!isHolding) {
    return context.quoteReply(i18n.__("message.vote.notHolding"));
  }

  context.replyFlex(vote.title, VoteTemplate.generateVote(vote));
}

/**
 * 投票
 * @param {LineContext} context
 */
exports.decide = async (context, { payload }) => {
  const { userId, displayName } = context.event.source;
  const { id, option } = payload;

  const isHolding = await getIsHolding(id);
  const vote = await getVoteFromCache(id);

  if (!isHolding) {
    // 如果最近一小時內已經通知過了，就不再通知
    if (context.state[`vote:${id}`].notifyCoolDown > moment().toDate().getTime()) {
      return;
    }

    context.setState({
      [`vote:${id}`]: {
        notifyCoolDown: moment().add(1, "hour").toDate().getTime(),
      },
    });

    return context.quoteReply(i18n.__("message.vote.notHolding"));
  }

  try {
    const userDecision = await VoteUserDecisionModel.all({
      filter: {
        user_id: userId,
        vote_id: id,
      },
    });

    if (userDecision.length > 0) {
      return await VoteUserDecisionModel.update(get(userDecision, "0.id"), {
        decision: option,
      });
    }

    await VoteUserDecisionModel.create({
      user_id: userId,
      vote_id: id,
      decision: option,
    });

    if (context.event.source.type === "user") {
      context.quoteReply(
        i18n.__("message.vote.decided", {
          title: vote.title,
          displayName,
        })
      );
    }
  } catch (e) {
    DefaultLogger.error(e);
  }
};

async function getIsHolding(voteId) {
  const voteData = await getVoteFromCache(voteId);
  if (!voteData) return false;

  const [startAt, endAt] = [moment(voteData.start_time), moment(voteData.end_time)];

  return moment().isBetween(startAt, endAt);
}

async function getVoteFromCache(voteId) {
  const key = `${config.get("redis.prefix.vote")}:${voteId}`;
  const value = await redis.get(key);

  if (value) return JSON.parse(value);

  const vote = await VoteModel.find(voteId);
  if (!vote) return null;

  await redis.set(key, JSON.stringify(vote), {
    EX: 60,
  });

  return vote;
}
