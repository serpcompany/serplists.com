import http from 'node:http';

const NODE_HTTP_AGENT = http.Agent;

class AgentThatOpensAConnectionPerRequest extends NODE_HTTP_AGENT {
  constructor(options: http.AgentOptions = {}) {
    super({ ...options, keepAlive: false });
  }
}

export function disableRequestKeepAlive() {
  if (!Reflect.set(http, 'Agent', AgentThatOpensAConnectionPerRequest)) {
    throw new Error("node:http's Agent can't be replaced, so Playwright's request contexts would keep idle connections open.");
  }
}

export function restoreRequestKeepAlive() {
  Reflect.set(http, 'Agent', NODE_HTTP_AGENT);
}
