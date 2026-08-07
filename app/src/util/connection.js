const express = require("express");
const server = express();

exports.server = server;
exports.http = require("http").createServer(this.server);

// The removed `origins: "*:*"` was a Socket.IO v2 key that v4 ignores outright,
// so dropping it changes no behaviour — it was just misleading.
//
// No `cors` option either, which means engine.io sends no CORS headers and a
// browser cannot read a cross-origin polling response. That is NOT the security
// boundary though: WebSocket upgrades are not subject to CORS at all. What
// actually protects the `/admin/messages` namespace is
//   1. SameSite=Lax on redive_session — the browser will not attach the session
//      cookie to a cross-site handshake in the first place, and
//   2. socketSetProfile / socketVerifyAdmin, which check the handshake Origin
//      and resolve the session server-side before any event is delivered.
// Hence no global `allowRequest`: it would duplicate (2) for every namespace,
// including the unauthenticated default one that only counts online users.
exports.io = require("socket.io")().attach(this.http, {
  log: false,
  agent: false,
  transports: ["websocket", "htmlfile", "xhr-polling", "jsonp-polling", "polling"],
});
