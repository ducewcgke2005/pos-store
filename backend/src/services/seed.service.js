const bcrypt = require('bcrypt');
const seedRepository = require('../repositories/seed.repository');
const { runInTransaction } = require('../infrastructure/transaction');
exports.seedDevelopment = async password => {
    if (!password) throw new Error('SEED_PASSWORD is required for development seed accounts');
    const hash = await bcrypt.hash(password,10);
    return runInTransaction(() => seedRepository.seedDevelopment(hash));
};
