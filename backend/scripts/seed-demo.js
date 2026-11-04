const { connectDB, disconnectDB } = require('../src/config/database');
const { seedDemo } = require('../src/services/demoSeed.service');

const main = async () => {
    if (!process.env.SEED_PASSWORD)
        throw new Error('SEED_PASSWORD is required');
    try {
        await connectDB();
        const result = await seedDemo(process.env.SEED_PASSWORD);
        console.log(
            result.alreadySeeded
                ? 'Demo data already exists; no duplicate records were created.'
                : 'Demo data created successfully.'
        );
        console.log(JSON.stringify(result.counts, null, 2));
        if (result.normalizedInvoices)
            console.log(
                `Normalized ${result.normalizedInvoices} legacy demo invoices to UNPAID; pending payments were preserved.`
            );
    } finally {
        await disconnectDB();
    }
};
if (require.main === module)
    main().catch((error) => {
        // Keep connection strings and driver details out of terminal output.
        console.error(
            error.message.startsWith('SEED_PASSWORD')
                ? error.message
                : `Demo seed failed (${error.name}); no partial demo batch was committed.`
        );
        process.exitCode = 1;
    });
