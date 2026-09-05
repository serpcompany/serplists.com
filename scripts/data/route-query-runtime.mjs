// Pure Worker-compatible runtime. The instrumented test bundle installs this
// object; production application modules never import or expose it.
export function createRouteQueryRuntime(sourceDigest) {
  const outcomes = new Map();
  const statements = new WeakMap();
  return {
    statement(id, value) {
      // Metadata alone is never execution evidence; do not touch thenables.
      statements.set(value, id);
      return value;
    },
    batchTarget(id, receiver) {
      // Capture the method before argument evaluation, exactly as a method call.
      const operation = receiver.batch;
      return async (...args) => {
        const selected = args[0].map(value => statements.get(value));
        if (selected.some(value => !value)) throw new Error('Unmapped batch statement origin');
        try {
          const result = await Reflect.apply(operation, receiver, args);
          for (const unit of [id, ...selected]) outcomes.set(unit, 'success');
          return result;
        } catch (error) {
          for (const unit of [id, ...selected]) if (!outcomes.has(unit)) outcomes.set(unit, 'error');
          throw error;
        }
      };
    },
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
