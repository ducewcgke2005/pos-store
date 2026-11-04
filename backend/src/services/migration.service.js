const migrationRepository = require('../repositories/migration.repository');
const { runInTransaction } = require('../infrastructure/transaction');
exports.importExport = async payload => {
    if (payload.schemaVersion !== 1 || !payload.tables || typeof payload.tables !== 'object') throw new Error('Expected { schemaVersion: 1, tables: { SQLTableName: [...] } }');
    return runInTransaction(session => migrationRepository.importTables(payload.tables,session));
};
