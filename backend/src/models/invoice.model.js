const { define, decimal } = require('./schema');

module.exports = define(
    'Invoice',
    'invoices',
    {
        id: {
            type: Number,
            required: true,
            unique: true,
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            validate: Number.isSafeInteger
        },
        invoiceCode: { type: String, required: true, maxlength: 50 },
        staffId: { type: Number, required: true, ref: 'Staff' },
        counterId: { type: Number, required: true, ref: 'Counter' },
        customerId: { type: Number, default: null, ref: 'Customer' },
        totalAmount: decimal(2, {
            required: true,
            default: 0,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        promotionId: { type: Number, default: null, ref: 'Promotion' },
        promotionDiscount: decimal(2, {
            default: 0,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        voucherId: { type: Number, default: null, ref: 'Voucher' },
        voucherDiscount: decimal(2, {
            default: 0,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        usedPoints: {
            type: Number,
            default: 0,
            min: 0,
            validate: Number.isSafeInteger
        },
        pointDiscount: decimal(2, {
            default: 0,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        finalAmount: decimal(2, {
            required: true,
            default: 0,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        status: {
            type: String,
            default: 'UNPAID',
            enum: [
                'UNPAID',
                'PENDING',
                'PAID',
                'CANCELLED',
                'REFUNDED',
                'PARTIALLY_REFUNDED'
            ],
            maxlength: 20
        },
        createdAt: { type: Date, default: Date.now },
        expiresAt: { type: Date, default: null },
        _revision: { type: Number, default: 0, select: false }
    },
    [
        [{ status: 1, createdAt: -1, id: -1 }, {}],
        [{ customerId: 1, createdAt: -1, id: -1 }, {}],
        [
            {
                invoiceCode: 1
            },
            {
                unique: true
            }
        ],
        [
            {
                staffId: 1
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
                customerId: 1
            },
            {}
        ],
        [
            {
                promotionId: 1
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
                createdAt: -1,
                id: -1
            },
            {}
        ]
    ],
    false
);
