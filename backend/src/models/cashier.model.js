const { define, decimal } = require('./schema');

module.exports = define(
    'CashHandover',
    'cashHandovers',
    {
        id: {
            type: Number,
            required: true,
            unique: true,
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            validate: Number.isSafeInteger
        },
        scheduleId: { type: Number, required: true, ref: 'WorkSchedule' },
        handoverTime: { type: Date, default: Date.now },
        openingCash: decimal(2, {
            default: 0,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        systemCash: decimal(2, {
            required: true,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        actualCash: decimal(2, {
            required: true,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        note: { type: String, default: null }
    },
    [
        [
            {
                scheduleId: 1
            },
            {
                unique: true
            }
        ]
    ],
    false
);
