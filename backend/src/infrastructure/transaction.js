const mongoose = require('mongoose');
const { AsyncLocalStorage } = require('node:async_hooks');
const context = new AsyncLocalStorage();

const currentSession = () => context.getStore()?.session;
const afterCommit = (callback) => {
    const scope = context.getStore();
    if (!scope) throw new Error('afterCommit requires a transaction');
    scope.effects.push(callback);
};

const runInTransaction = async (callback) => {
    if (currentSession()) return callback(currentSession());
    const session = await mongoose.startSession();
    let effects = [];
    try {
        const result = await session.withTransaction(
            async () => {
                const scope = { session, effects: [] };
                const value = await context.run(scope, () => callback(session));
                effects = scope.effects;
                return value;
            },
            {
                readConcern: { level: 'snapshot' },
                writeConcern: { w: 'majority' },
                readPreference: 'primary'
            }
        );
        // Retried callbacks discard their effects. External work only runs after commit.
        for (const effect of effects) {
            try {
                await effect();
            } catch (_) {
                console.error('Post-commit notification failed');
            }
        }
        return result;
    } finally {
        await session.endSession();
    }
};

const transactional = (work) =>
    function (...args) {
        return runInTransaction(() => work.apply(this, args));
    };

module.exports = {
    runInTransaction,
    currentSession,
    afterCommit,
    transactional
};
