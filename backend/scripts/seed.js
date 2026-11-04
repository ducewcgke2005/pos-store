const { connectDB, disconnectDB } = require('../src/config/database');
const { seedDevelopment } = require('../src/services/seed.service');
const main = async () => {
    if (!process.env.SEED_PASSWORD)
        throw new Error('SEED_PASSWORD is required');
    try {
        await connectDB();
        await seedDevelopment(process.env.SEED_PASSWORD);
        console.log(
            'Development seed completed. Existing accounts and passwords were preserved.'
        );
    } finally {
        await disconnectDB();
    }
};
if (require.main === module)
    main().catch((error) => {
        console.error(
            error.message.startsWith('SEED_PASSWORD')
                ? error.message
                : 'Seed failed; check local database configuration and existing data.'
        );
        process.exitCode = 1;
    });
