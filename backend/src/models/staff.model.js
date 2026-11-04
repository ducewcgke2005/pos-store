const { define, decimal } = require('./schema');

module.exports = define(
    'Staff',
    'staff',
    {
        id: {
            type: Number,
            required: true,
            unique: true,
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            validate: Number.isSafeInteger
        },
        userId: { type: Number, default: null, ref: 'User' },
        fullName: { type: String, required: true, maxlength: 100 },
        phoneNumber: { type: String, required: true, maxlength: 20 },
        email: { type: String, default: null, maxlength: 100 },
        salaryType: {
            type: String,
            required: true,
            default: 'hourly',
            enum: ['monthly', 'hourly'],
            maxlength: 20
        },
        baseSalary: decimal(2, {
            default: 0,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        employmentStatus: {
            type: String,
            default: 'working',
            enum: ['working', 'resigned'],
            maxlength: 20
        },
        createdAt: { type: Date, default: Date.now }
    },
    [
        [
            {
                phoneNumber: 1
            },
            {
                unique: true
            }
        ],
        [
            {
                email: 1
            },
            {
                unique: true,
                partialFilterExpression: {
                    email: {
                        $type: 'string'
                    }
                }
            }
        ],
        [
            {
                userId: 1
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
