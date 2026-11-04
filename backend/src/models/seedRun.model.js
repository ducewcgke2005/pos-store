const { define } = require('./schema');

const countFields = [
    'categories',
    'products',
    'productUnits',
    'suppliers',
    'customers',
    'staff',
    'shifts',
    'schedules',
    'handovers',
    'purchaseOrders',
    'invoices',
    'payments',
    'promotions',
    'vouchers',
    'returns',
    'adjustments',
    'reports',
    'payrolls'
];

module.exports = define('SeedRun', 'seedRuns', {
    _id: { type: String, required: true },
    state: { type: String, required: true, enum: ['creating', 'completed'] },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    counts: Object.fromEntries(
        countFields.map((key) => [key, { type: Number, default: 0, min: 0 }])
    )
});
