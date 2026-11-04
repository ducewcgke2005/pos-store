const { define, decimal } = require('./schema');

module.exports = define(
    'Problematic',
    'problematicGoodsReport',
    {
        id: {
            type: Number,
            required: true,
            unique: true,
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            validate: Number.isSafeInteger
        },
        title: { type: String, required: true, maxlength: 255 },
        issueDescription: { type: String, default: null },
        reportedBy: { type: Number, required: true, ref: 'Staff' },
        status: { type: String, default: 'Open', maxlength: 20 },
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
