const { define, decimal } = require('./schema');

module.exports = define(
    'Counter',
    'counters',
    {
        id: {
            type: Number,
            required: true,
            unique: true,
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            validate: Number.isSafeInteger
        },
        counterCode: { type: String, required: true, maxlength: 50 },
        counterName: { type: String, required: true, maxlength: 100 },
        status: {
            type: String,
            default: 'ACTIVE',
            enum: ['ACTIVE', 'INACTIVE'],
            maxlength: 20
        }
    },
    [
        [
            {
                counterCode: 1
            },
            {
                unique: true
            }
        ]
    ],
    false
);
