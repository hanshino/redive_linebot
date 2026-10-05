const partial = require("lodash/partial");

function chain(actions) {
  if (!Array.isArray(actions)) throw new TypeError("Chain stack must be an array!");
  for (const action of actions) {
    if (typeof action !== "function") throw new TypeError("Chain must be composed of actions!");
  }
  return function Chain(context, props = {}) {
    return actions
      .slice()
      .reverse()
      .reduce(
        (next, action, index) =>
          action.bind(null, context, index === 0 ? { ...props } : { ...props, next }),
        undefined
      );
  };
}

function withProps(action, props) {
  Object.freeze(props);
  const actionWithProps = partial(action, partial.placeholder, props);
  Object.defineProperty(actionWithProps, "name", { value: action.name || "Anonymous" });
  return actionWithProps;
}

function router(routes) {
  return async function Router(context, props = {}) {
    for (const r of routes) {
      const match = await r.predicate(context);
      if (match) {
        const derivedProps = typeof match === "object" ? match : {};
        return r.action.bind(null, context, { ...props, ...derivedProps });
      }
    }
    return props.next;
  };
}

function route(pattern, action) {
  return { predicate: pattern === "*" ? () => true : pattern, action };
}

function text(pattern, action) {
  if (typeof pattern === "string") {
    return route(
      pattern === "*" ? context => context.event.isText : context => context.event.text === pattern,
      action
    );
  }
  if (pattern instanceof RegExp) {
    return route(context => {
      // Preserve exec's non-text coercion, capture metadata and stateful lastIndex.
      const match = pattern.exec(context.event.text);
      return match ? { match } : false;
    }, action);
  }
  if (Array.isArray(pattern)) {
    return route(context => pattern.includes(context.event.text), action);
  }
  return route(() => false, action);
}

const line = action => route(context => context.platform === "line", action);
line.any = line;
for (const type of [
  "message",
  "follow",
  "unfollow",
  "join",
  "leave",
  "memberJoined",
  "memberLeft",
]) {
  const flag = `is${type[0].toUpperCase()}${type.slice(1)}`;
  line[type] = action =>
    route(context => context.platform === "line" && context.event[flag], action);
}

async function run(action, context, props = {}) {
  let result = await action(context, props);
  while (typeof result === "function") result = await result(context, {});
  return result;
}

module.exports = { chain, withProps, router, route, text, line, run };
