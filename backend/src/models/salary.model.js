const { define, decimal } = require('./schema');

module.exports = define(
    'Payroll',
    'payrolls',
    {
        id: {
            type: Number,
            required: true,
            unique: true,
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            validate: Number.isSafeInteger
        },
        staffId: { type: Number, required: true, ref: 'Staff' },
        month: {
            type: Number,
            required: true,
            min: 1,
            max: 12,
            validate: Number.isSafeInteger
        },
        year: {
            type: Number,
            required: true,
            min: 1900,
            max: 9999,
            validate: Number.isSafeInteger
        },
        appliedBaseSalary: decimal(2, {
            required: true,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        appliedSalaryType: { type: String, required: true, maxlength: 20 },
        totalWorkUnit: { type: Number, required: true },
        provisionalSalary: decimal(2, {
            default: null,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        deductions: decimal(2, {
            default: 0,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        finalAmount: decimal(2, {
            default: null,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        note: { type: String, default: null },
        status: {
            type: String,
            default: 'draft',
            enum: ['draft', 'paid'],
            maxlength: 20
        },
        createdAt: { type: Date, default: Date.now }
    },
    [
        [
            {
                staffId: 1,
                month: 1,
                year: 1
            },
            {
                unique: true
            }
        ],
        [
            {
                staffId: 1
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
