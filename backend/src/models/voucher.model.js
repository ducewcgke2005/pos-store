const { define, decimal } = require('./schema');
module.exports = define(
    'Voucher',
    'vouchers',
    {
        id: {
            type: Number,
            required: true,
            unique: true,
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            validate: Number.isSafeInteger
        },
        code: { type: String, required: true, maxlength: 30 },
        value: decimal(2, {
            required: true,
            validate: { validator: (v) => Number(v.toString()) >= 0 }
        }),
        type: { type: String, required: true, enum: ['Percent', 'Fixed'] },
        minOrderValue: decimal(2, {
            default: 0,
            validate: { validator: (v) => Number(v.toString()) >= 0 }
        }),
        maxUsage: {
            type: Number,
            default: 100,
            min: 0,
            validate: Number.isSafeInteger
        },
        currentUsage: {
            type: Number,
            default: 0,
            min: 0,
            validate: Number.isSafeInteger
        },
        startDate: { type: Date, default: null },
        expiryDate: { type: Date, default: null },
        status: {
            type: String,
            enum: ['Active', 'Expired', 'Disabled'],
            default: 'Active'
        },
        createdAt: { type: Date, default: Date.now }
    },
    [
        [
            { code: 1 },
            { unique: true, collation: { locale: 'en', strength: 2 } }
        ],
        [{ createdAt: -1, id: -1 }, {}]
    ],
    false
);
