const cloneDeep = require("lodash/cloneDeep");

class LineEvent {
  constructor(rawEvent, options = {}) {
    this._rawEvent = rawEvent;
    this._destination = options.destination;
  }

  get rawEvent() {
    return this._rawEvent;
  }

  get timestamp() {
    return this._rawEvent.timestamp;
  }

  get destination() {
    return this._destination || null;
  }

  get replyToken() {
    return "replyToken" in this._rawEvent ? this._rawEvent.replyToken : null;
  }

  get source() {
    return this._rawEvent.source || null;
  }

  get isMessage() {
    return this._rawEvent.type === "message";
  }

  get message() {
    return this._rawEvent.message || null;
  }

  get isText() {
    return this.isMessage && this.message.type === "text";
  }

  get text() {
    return this.isText ? this.message.text : null;
  }

  get isPostback() {
    return this._rawEvent.type === "postback";
  }

  get postback() {
    return this._rawEvent.postback || null;
  }

  get isPayload() {
    return this.isPostback;
  }

  get payload() {
    return this.isPayload ? this.postback.data : null;
  }

  get isFollow() {
    return this._rawEvent.type === "follow";
  }

  get follow() {
    return this.isFollow ? this.source : null;
  }

  get isUnfollow() {
    return this._rawEvent.type === "unfollow";
  }

  get unfollow() {
    return this.isUnfollow ? this.source : null;
  }

  get isJoin() {
    return this._rawEvent.type === "join";
  }

  get join() {
    return this.isJoin ? this.source : null;
  }

  get isLeave() {
    return this._rawEvent.type === "leave";
  }

  get leave() {
    return this.isLeave ? this.source : null;
  }

  get isMemberJoined() {
    return this._rawEvent.type === "memberJoined";
  }

  get memberJoined() {
    return this._rawEvent.joined || null;
  }

  get isMemberLeft() {
    return this._rawEvent.type === "memberLeft";
  }

  get memberLeft() {
    return this._rawEvent.left || null;
  }
}

class Context {
  constructor({ client, event, session, initialState, logger = console }) {
    this._client = client;
    this._event = event;
    this._session = session || null;
    this._initialState = initialState || {};
    this._logger = logger;
    this._isHandled = null;
    this.isSessionWritten = false;
    if (this._session && !this._session._state) {
      this._session._state = cloneDeep(this._initialState);
    }
  }

  get client() {
    return this._client;
  }

  get event() {
    return this._event;
  }

  get session() {
    return this._session;
  }

  get state() {
    if (this._session) return this._session._state;
    this._logger.warn(
      "state: is not accessible in context without session. Falling back to an empty object."
    );
    return {};
  }

  getState() {
    return this.state;
  }

  setState(patch) {
    if (!this._session) {
      this._logger.warn("setState: should not be called in context without session");
      return;
    }
    this._warnIfWritten("setState");
    this._session._state = { ...this._session._state, ...patch };
  }

  resetState() {
    if (!this._session) {
      this._logger.warn("resetState: should not be called in context without session");
      return;
    }
    this._warnIfWritten("resetState");
    this._session._state = cloneDeep(this._initialState);
  }

  _warnIfWritten(method) {
    if (this.isSessionWritten) {
      this._logger.warn(
        `Calling \`context.${method}\` after session has been written. Some changes to state will not be saved.\nDid you forget to await any async function?`
      );
    }
  }

  get isHandled() {
    return this._isHandled;
  }

  setAsHandled(handled = true) {
    this._isHandled = handled;
  }

  setAsNotHandled() {
    this.setAsHandled(false);
  }

  emitError(error) {
    this._logger.error(error);
  }
}

class LineContext extends Context {
  constructor({ client, rawEvent, destination, state, initialState, logger }) {
    const event = new LineEvent(rawEvent, { destination });
    const source = event.source;
    const sourceId = source && source[`${source.type}Id`];
    super({
      client,
      event,
      session: { id: `line:${sourceId}`, _state: state },
      initialState,
      logger,
    });
    this._shouldBatch = true;
    this._isReplied = false;
    this._replyMessages = [];
  }

  get platform() {
    return "line";
  }

  get isReplied() {
    return this._isReplied;
  }

  reply(messages) {
    if (this._isReplied) throw new Error("Can not reply event multiple times");
    if (this._shouldBatch) {
      this._replyMessages.push(...messages);
      return;
    }
    this._isReplied = true;
    return this._client.reply(this._event.replyToken, messages);
  }

  replyText(text, options) {
    return this.reply([{ type: "text", text, ...options }]);
  }

  replyFlex(altText, contents, options) {
    return this.reply([{ type: "flex", altText, contents, ...options }]);
  }

  replyImage(image, options) {
    return this.reply([
      {
        type: "image",
        originalContentUrl: image.originalContentUrl,
        previewImageUrl: image.previewImageUrl || image.originalContentUrl,
        ...options,
      },
    ]);
  }

  sendText(text, options) {
    return this.replyText(text, options);
  }

  async handlerDidEnd() {
    if (this._shouldBatch) {
      this._shouldBatch = false;
      if (this._replyMessages.length && this._event.replyToken) {
        // Deliberate difference: let LINE reject >5 messages rather than truncate.
        // Like Bottender, flushing does not set _isReplied or clear the queue.
        await this._client.reply(this._event.replyToken, this._replyMessages);
      }
    }
  }

  async getUserProfile() {
    const source = this._event.source;
    if (!source || !source.userId) return null;
    switch (source.type) {
      case "group":
        return this._client.getGroupMemberProfile(source.groupId, source.userId);
      case "room":
        return this._client.getRoomMemberProfile(source.roomId, source.userId);
      default:
        return this._client.getUserProfile(source.userId);
    }
  }
}

module.exports = { LineEvent, LineContext, Context };
