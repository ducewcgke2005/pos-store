const { define, decimal } = require('./schema');

module.exports = define(
    'Shift',
    'shifts',
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
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
        checkInStart: { type: String, default: null },
        checkInEnd: { type: String, default: null },
        checkOutDeadline: { type: String, default: null },
        isActive: { type: Boolean, required: true, default: 1 }
    },
    [],
    false
);
