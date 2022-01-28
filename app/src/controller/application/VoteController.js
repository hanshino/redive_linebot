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
const { get } = require("lodash");

exports.router = [text(/^[.#/](投票|vote) (?<voteId>\d+)$/, show)];

/**
 * 顯示投票
 * @param {LineContext} context
 */
async function show(context, props) {
  const { voteId } = props.match.groups;

  const vote = await VoteModel.find(voteId);

  if (!vote) {
    return context.replyText(i18n.__("message.vote.notFound"));
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

  if (!isHolding) {
    return context.replyText(i18n.__("message.vote.notHolding"));
  }

  try {
    const userDecision = await VoteUserDecisionModel.all({
      filter: {
        user_id: userId,
        vote_id: id,
      },
    });

    if (userDecision.length > 0) {
      await VoteUserDecisionModel.update(get(userDecision, "0.id"), {
        decision: option,
      });
    } else {
      await VoteUserDecisionModel.create({
        user_id: userId,
        vote_id: id,
        decision: option,
      });

      context.replyText(
        i18n.__("message.vote.decided", {
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

  if (value) return value;

  const vote = await VoteModel.find(voteId);
  if (!vote) return null;

  await redis.set(key, vote);

  return vote;
}
