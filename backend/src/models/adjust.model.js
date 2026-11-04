const { define, decimal } = require('./schema');

module.exports = define(
    'Adjustment',
    'inventoryAdjustments',
    {
        id: {
            type: Number,
            required: true,
            unique: true,
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            validate: Number.isSafeInteger
        },
        createdBy: { type: Number, required: true, ref: 'Staff' },
        reason: { type: String, required: true, maxlength: 50 },
        status: {
            type: String,
            default: 'Pending',
            enum: ['Pending', 'Approved', 'Rejected'],
            maxlength: 20
        },
        createdAt: { type: Date, default: Date.now },
        processedBy: { type: Number, default: null, ref: 'Staff' },
        processedAt: { type: Date, default: null }
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
