const { define, decimal } = require('./schema');

module.exports = define(
    'User',
    'users',
    {
        id: {
            type: Number,
            required: true,
            unique: true,
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            validate: Number.isSafeInteger
        },
        roleId: { type: Number, required: true, ref: 'Role' },
        username: { type: String, required: true, maxlength: 50 },
        passwordHash: { type: String, required: true, maxlength: 255 },
        isActive: {
            type: String,
            default: 'active',
            enum: ['active', 'locked'],
            maxlength: 20
        },
        createdAt: { type: Date, default: Date.now },
        requirePasswordChange: { type: Boolean, default: true }
    },
    [
        [
            {
                username: 1
            },
            {
                unique: true
            }
        ],
        [
            {
                roleId: 1
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
