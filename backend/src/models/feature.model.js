const { define, decimal } = require('./schema');

module.exports = define(
    'Feature',
    'features',
    {
        id: {
            type: Number,
            required: true,
            unique: true,
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            validate: Number.isSafeInteger
        },
        featureKey: { type: String, required: true, maxlength: 100 },
        description: { type: String, default: null }
    },
    [
        [
            {
                featureKey: 1
            },
            {
                unique: true
            }
        ]
    ],
    false
);
