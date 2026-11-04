const { define, decimal } = require('./schema');

module.exports = define(
    'Promotion',
    'promotions',
    {
        id: {
            type: Number,
            required: true,
            unique: true,
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            validate: Number.isSafeInteger
        },
        name: { type: String, default: null, maxlength: 255 },
        type: {
            type: String,
            required: true,
            enum: ['Percent', 'Amount', 'BuyXGetY'],
            maxlength: 20
        },
        value: decimal(2, {
            default: null,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        startDate: { type: Date, default: null },
        endDate: { type: Date, default: null },
        status: {
            type: String,
            default: 'Active',
            enum: ['Active', 'Expired', 'Disabled'],
            maxlength: 20
        },
        createdAt: { type: Date, default: Date.now }
    },
    [
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
