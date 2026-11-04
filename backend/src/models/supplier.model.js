const { define, decimal } = require('./schema');

module.exports = define(
    'Supplier',
    'suppliers',
    {
        id: {
            type: Number,
            required: true,
            unique: true,
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            validate: Number.isSafeInteger
        },
        name: { type: String, required: true, maxlength: 255 },
        contactInfo: { type: String, default: null, maxlength: 255 },
        address: { type: String, default: null, maxlength: 255 }
    },
    [],
    false
);
