const { define, decimal } = require('./schema');

module.exports = define(
    'Payment',
    'payments',
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
        paymentMethod: {
            type: String,
            required: true,
            enum: ['CASH', 'BANK_TRANSFER', 'QR_VNPAY', 'BANK_QR'],
            maxlength: 20
        },
        amount: decimal(2, {
            required: true,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        status: {
            type: String,
            required: true,
            enum: ['PENDING', 'SUCCESS', 'FAILED', 'CANCELLED'],
            maxlength: 20
        },
        createdAt: { type: Date, default: Date.now },
        transactionId: { type: String, default: null }
    },
    [
        [
            {
                invoiceId: 1
            },
            {
                unique: true
            }
        ],
        [
            {
                transactionId: 1
            },
            {
                unique: true,
                partialFilterExpression: {
                    transactionId: {
                        $type: 'string'
                    }
                }
            }
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
