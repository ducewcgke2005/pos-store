const { define, decimal } = require('./schema');

module.exports = define(
    'CustomerVoucherUsage',
    'customerVoucherUsage',
    {
        id: {
            type: Number,
            required: true,
            unique: true,
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            validate: Number.isSafeInteger
        },
        customerId: { type: Number, required: true, ref: 'Customer' },
        voucherId: { type: Number, required: true, ref: 'Voucher' },
        invoiceId: { type: Number, required: true, ref: 'Invoice' },
        usedAt: { type: Date, default: Date.now }
    },
    [
        [
            {
                customerId: 1
            },
            {}
        ],
        [
            {
                voucherId: 1
            },
            {}
        ],
        [
            {
                invoiceId: 1
            },
            {}
        ]
    ],
    false
);
