const { define, decimal } = require('./schema');

module.exports = define(
    'Customer',
    'customers',
    {
        id: {
            type: Number,
            required: true,
            unique: true,
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            validate: Number.isSafeInteger
        },
        phone: { type: String, default: null, maxlength: 15 },
        name: { type: String, default: null, maxlength: 100 },
        loyaltyPoints: {
            type: Number,
            default: 0,
            min: 0,
            validate: Number.isSafeInteger
        },
        totalSpending: decimal(2, {
            default: 0,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        status: {
            type: String,
            default: 'Active',
            enum: ['Active', 'Inactive', 'Blocked'],
            maxlength: 20
        },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now }
    },
    [
        [
            {
                phone: 1
            },
            {
                unique: true,
                partialFilterExpression: {
                    phone: {
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
    { createdAt: 'createdAt', updatedAt: 'updatedAt' }
);
