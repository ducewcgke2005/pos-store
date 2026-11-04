const mongoose = require('mongoose');
const { currentSession } = require('../infrastructure/transaction');
const Sequence = require('../models/sequence.model');

const options = (session) => ({
    session: session || currentSession(),
    runValidators: true
});
const clean = (value) => {
    if (value == null || value instanceof Date) return value;
    if (value._bsontype === 'Decimal128') return Number(value.toString());
    if (Array.isArray(value)) return value.map(clean);
    if (typeof value !== 'object') return value;
    if (value.toObject) return clean(value.toObject());
    return Object.fromEntries(
        Object.entries(value)
            .filter(([key]) => !['_id', '__v', '_revision'].includes(key))
            .map(([key, item]) => [key, clean(item)])
    );
};
const nextId = async (collection, session) => {
    const counter = await Sequence.findOneAndUpdate(
        { _id: collection },
        { $inc: { value: 1 } },
        { ...options(session), upsert: true, new: true }
    )
        .lean()
        .exec();
    if (!Number.isSafeInteger(counter.value) || counter.value < 1)
        throw new Error('Public ID exceeds safe integer range');
    return counter.value;
};
const ensureReferences = async (Model, data, session) => {
    for (const [key, field] of Object.entries(Model.schema.paths)) {
        const ref = field.options.ref;
        if (ref && data[key] != null) {
            const parent = mongoose.model(ref);
            if (
                !(await parent
                    .exists({ id: data[key] })
                    .session(options(session).session || null))
            ) {
                const error = new Error(
                    `Dữ liệu liên kết không hợp lệ: ${key}`
                );
                error.number = 547;
                throw error;
            }
        }
    }
};
// Shared serialization/identity primitives, not a generic repository.
const insert = async (Model, data, session) => {
    await ensureReferences(Model, data, session);
    const fields = { ...data };
    if (Model.schema.path('id') && fields.id == null)
        fields.id = await nextId(Model.collection.name, session);
    try {
        const [doc] = await Model.create([fields], options(session));
        return clean(doc);
    } catch (error) {
        throw translateError(error);
    }
};
const translateError = (error) => {
    if (error.code === 11000) error.number = 2627;
    return error;
};
const regex = (value) =>
    new RegExp(String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
const pick = (row, keys) =>
    row &&
    Object.fromEntries(keys.split(' ').map((key) => [key, row[key] ?? null]));
const page = (rows, limit = 10, offset = 0) =>
    rows.slice(Number(offset), Number(offset) + Number(limit));
const sum = (rows, field) =>
    rows.reduce((total, row) => total + Number(row[field] || 0), 0);
const vnNow = () => new Date(Date.now() + 7 * 3600000);
const today = () => vnNow().toISOString().slice(0, 10);
const day = (value) =>
    value instanceof Date
        ? value.toISOString().slice(0, 10)
        : String(value).slice(0, 10);
const timeDate = (value) =>
    value == null
        ? null
        : new Date(`1970-01-01T${String(value).slice(0, 8).padEnd(8, ':00')}Z`);
module.exports = {
    options,
    clean,
    nextId,
    insert,
    ensureReferences,
    translateError,
    regex,
    pick,
    page,
    sum,
    vnNow,
    today,
    day,
    timeDate
};
