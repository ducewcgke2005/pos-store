const { define, decimal } = require('./schema');

module.exports = define(
    'Return',
    'returns',
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
        counterId: { type: Number, required: true, ref: 'Counter' },
        staffId: { type: Number, required: true, ref: 'Staff' },
        returnType: {
            type: String,
            required: true,
            enum: ['REFUND', 'EXCHANGE'],
            maxlength: 20
        },
        refundMethod: {
            type: String,
            required: true,
            enum: ['CASH', 'QR_VNPAY'],
            maxlength: 20
        },
        totalRefundAmount: decimal(2, {
            required: true,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        reason: { type: String, default: null },
        createdAt: { type: Date, default: Date.now },
        approvedAt: { type: Date, default: null },
        status: {
            type: String,
            required: true,
            default: 'Pending',
            enum: ['Pending', 'Approve', 'Reject'],
            maxlength: 20
        },
        approveBy: { type: Number, default: null, ref: 'Staff' },
        note: { type: String, default: null }
    },
    [
        [{ invoiceId: 1, createdAt: -1, id: -1 }, {}],
        [
            {
                invoiceId: 1
            },
            {}
        ],
        [
            {
                counterId: 1
            },
            {}
        ],
        [
            {
                staffId: 1
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
