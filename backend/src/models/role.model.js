const { define, decimal } = require('./schema');

module.exports = define(
    'Role',
    'roles',
    {
        id: {
            type: Number,
            required: true,
            unique: true,
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            validate: Number.isSafeInteger
        },
        name: { type: String, required: true, maxlength: 50 },
        description: { type: String, default: null }
    },
    [
        [
            {
                name: 1
            },
            {
                unique: true
            }
        ]
    ],
    false
);
