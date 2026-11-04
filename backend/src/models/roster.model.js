const { define, decimal } = require('./schema');

module.exports = define(
    'WorkSchedule',
    'workSchedules',
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
        shiftId: { type: Number, required: true, ref: 'Shift' },
        workDate: { type: String, required: true },
        checkInTime: { type: Date, default: null },
        checkOutTime: { type: Date, default: null },
        workedHours: { type: Number, default: 0 },
        status: {
            type: String,
            default: 'assigned',
            enum: ['assigned', 'working', 'completed', 'absent', 'late'],
            maxlength: 20
        },
        note: { type: String, default: null },
        attendanceRecord: { type: String, default: 'OnTime' },
        penaltyAmount: decimal(2, { default: 0 })
    },
    [
        [{ staffId: 1, workDate: 1, status: 1 }, {}],
        [
            {
                staffId: 1,
                shiftId: 1,
                workDate: 1
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
                shiftId: 1
            },
            {}
        ]
    ],
    false
);
