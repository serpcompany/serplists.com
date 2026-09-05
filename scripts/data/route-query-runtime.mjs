// Pure Worker-compatible runtime. The instrumented test bundle installs this
// object; production application modules never import or expose it.
export function createRouteQueryRuntime(sourceDigest) {
  const outcomes = new Map();
  return {
    hit(id) {
      outcomes.set(id, 'success');
    },
    async observe(id, value) {
      try {
        const result = await value;
        outcomes.set(id, 'success');
        return result;
      } catch (error) {
        if (!outcomes.has(id)) outcomes.set(id, 'error');
        throw error;
      }
    },
    async run(id, operation) {
      try {
        const result = await operation();
        outcomes.set(id, 'success');
        return result;
      } catch (error) {
        if (!outcomes.has(id)) outcomes.set(id, 'error');
        throw error;
      }
    },
    snapshot() {
      return {
        sourceDigest,
        outcomes: [...outcomes].map(([id, outcome]) => ({ id, outcome })),
      };
    },
  };
}
