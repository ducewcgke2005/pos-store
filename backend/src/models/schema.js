const mongoose = require('mongoose');

const quantize = (value, scale) => {
    const match = String(value).match(
        /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i
    );
    if (!match) throw new Error('Giá trị decimal không hợp lệ');
    const [, sign, whole, fraction = '', exponent = '0'] = match;
    const shift = fraction.length - Number(exponent) - scale;
    if (Math.abs(shift) > 100)
        throw new Error('Giá trị decimal vượt độ chính xác API hỗ trợ');
    let coefficient = BigInt(whole + fraction);
    if (shift > 0) {
        const divisor = 10n ** BigInt(shift);
        const remainder = coefficient % divisor;
        coefficient =
            coefficient / divisor + (remainder * 2n >= divisor ? 1n : 0n);
    } else coefficient *= 10n ** BigInt(-shift);
    if (coefficient > BigInt(Number.MAX_SAFE_INTEGER))
        throw new Error('Giá trị decimal vượt độ chính xác API hỗ trợ');
    const digits = coefficient.toString().padStart(scale + 1, '0');
    const number = scale
        ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`
        : digits;
    return sign === '-' && coefficient !== 0n ? `-${number}` : number;
};

// Data definitions only. ID allocation and reference checks belong to repositories.
const decimal = (scale = 2, options = {}) => ({
    type: mongoose.Schema.Types.Decimal128,
    set(value) {
        if (value == null) return value;
        return mongoose.Types.Decimal128.fromString(
            quantize(value.toString(), scale)
        );
    },
    validate: {
        validator: (value) =>
            value == null || Number.isFinite(Number(value.toString()))
    },
    ...options
});

const define = (name, collection, fields, indexes = [], timestamps = false) => {
    const schema = new mongoose.Schema(fields, {
        collection,
        versionKey: false,
        id: false,
        strict: 'throw',
        timestamps,
        toJSON: {
            transform: (_doc, value) => {
                delete value._id;
                return value;
            }
        }
    });
    for (const [keys, options] of indexes) {
        const indexOptions = { ...(options || {}) };
        // SQL business keys are case-insensitive; retain that for unique strings.
        if (
            indexOptions.unique &&
            Object.keys(keys).some(
                (key) => schema.path(key)?.instance === 'String'
            )
        ) {
            indexOptions.collation ||= { locale: 'en', strength: 2 };
        }
        schema.index(keys, indexOptions);
    }
    return mongoose.models[name] || mongoose.model(name, schema);
};

module.exports = { define, decimal };
