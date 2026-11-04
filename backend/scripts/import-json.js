const fs = require('node:fs/promises');
const { connectDB, disconnectDB } = require('../src/config/database');
const { importExport } = require('../src/services/migration.service');
const main = async () => {
    const file = process.argv[2];
    if (!file)
        throw new Error('Usage: npm run migrate:json -- path/to/export.json');
    const payload = JSON.parse(await fs.readFile(file, 'utf8'));
    try {
        await connectDB();
        console.log(JSON.stringify(await importExport(payload), null, 2));
    } finally {
        await disconnectDB();
    }
};
if (require.main === module)
    main().catch((error) => {
        console.error(
            error.message.includes('mongodb')
                ? 'Import failed; check database configuration.'
                : error.message
        );
        process.exitCode = 1;
    });
