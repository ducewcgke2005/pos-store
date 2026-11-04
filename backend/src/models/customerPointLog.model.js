const { define, decimal } = require('./schema');

module.exports = define(
    'CustomerPointLog',
    'customerPointLogs',
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
        invoiceId: { type: Number, default: null, ref: 'Invoice' },
        pointChange: {
            type: Number,
            required: true,
            validate: Number.isSafeInteger
        },
        reason: { type: String, default: null, maxlength: 255 },
        createdAt: { type: Date, default: Date.now }
    },
    [
        [{ customerId: 1, createdAt: -1, id: -1 }, {}],
        [
            {
                customerId: 1
            },
            {}
        ],
        [
            {
                invoiceId: 1
            },
            {}
        ],
        [
            {
                createdAt: -1,
                id: -1
            },
            {}
        ]
    ],
    false
);
