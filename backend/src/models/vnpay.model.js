const { define, decimal } = require('./schema');

module.exports = define(
    'VnPayTransaction',
    'vnPayTransactions',
    {
        id: {
            type: Number,
            required: true,
            unique: true,
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            validate: Number.isSafeInteger
        },
        invoiceId: { type: Number, required: true, ref: 'Invoice' },
        txnRef: { type: String, default: null, maxlength: 100 },
        responseCode: { type: String, default: null, maxlength: 10 },
        payUrl: { type: String, default: null },
        status: { type: String, default: null, maxlength: 20 },
        createdAt: { type: Date, default: Date.now }
    },
    [
        [
            {
                txnRef: 1
            },
            {
                unique: true,
                partialFilterExpression: {
                    txnRef: {
                        $type: 'string'
                    }
                }
            }
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
