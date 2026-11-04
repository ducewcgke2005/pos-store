const { Voucher, Invoice } = require('../models');
const { options, clean, insert, regex, pick, page, sum } = require('./helpers');
const filterVouchers = ({ search, status } = {}) => ({
    ...(search ? { code: regex(search) } : {}),
    ...(status ? { status } : {})
});
exports.getVouchers = async ({ limit = 10, offset = 0, ...filters } = {}) =>
    clean(
        await Voucher.find(filterVouchers(filters), null, options())
            .sort({ createdAt: -1, id: -1 })
            .skip(Number(offset))
            .limit(Number(limit))
            .lean()
            .exec()
    );
exports.countVouchers = async (filters) =>
    Voucher.countDocuments(filterVouchers(filters))
        .session(options().session || null)
        .exec();
exports.getVoucherById = async (id) =>
    clean(await Voucher.findOne({ id }, null, options()).lean().exec());
exports.getVoucherByCode = async (code) =>
    clean(
        await Voucher.findOne({ code }, null, options())
            .collation({ locale: 'en', strength: 2 })
            .lean()
            .exec()
    );
exports.createVoucher = async (data) => {
    try {
        return await insert(Voucher, {
            ...pick(data, 'code value type'),
            minOrderValue: data.minOrderValue ?? 0,
            maxUsage: data.maxUsage ?? 100,
            startDate: data.startDate || null,
            expiryDate: data.expiryDate || null,
            status: data.status || 'Active'
        });
    } catch (error) {
        if (error.code === 11000)
            throw new Error(
                `Mã voucher "${data.code}" đã tồn tại trong hệ thống. Vui lòng dùng mã khác.`
            );
        throw error;
    }
};
exports.updateVoucher = async (id, data) => {
    const fields = Object.fromEntries(
        [
            'value',
            'type',
            'minOrderValue',
            'maxUsage',
            'startDate',
            'expiryDate',
            'status'
        ]
            .filter((key) => data[key] !== undefined)
            .map((key) => [key, data[key]])
    );
    if (!Object.keys(fields).length) return null;
    return clean(
        await Voucher.findOneAndUpdate(
            { id },
            { $set: fields },
            { ...options(), new: true }
        )
            .lean()
            .exec()
    );
};
exports.deleteVoucher = async (id) =>
    clean(
        await Voucher.findOneAndUpdate(
            { id },
            { $set: { status: 'Disabled' } },
            { ...options(), new: true }
        )
            .lean()
            .exec()
    );
exports.increaseUsage = async (session, id) => {
    const now = new Date();
    const result = await Voucher.updateOne(
        {
            id,
            status: 'Active',
            $expr: { $lt: ['$currentUsage', '$maxUsage'] },
            $and: [
                { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
                { $or: [{ expiryDate: null }, { expiryDate: { $gte: now } }] }
            ]
        },
        { $inc: { currentUsage: 1 } },
        options(session)
    ).exec();
    if (!result.matchedCount) throw new Error('Voucher usage exceeded');
};
exports.getVoucherReport = async ({ limit = 20, offset = 0 } = {}) => {
    const vouchers = clean(
        await Voucher.find({}, null, options()).lean().exec()
    );
    const rows = [];
    for (const voucher of vouchers) {
        const invoices = clean(
            await Invoice.find(
                { voucherId: voucher.id, status: 'PAID' },
                null,
                options()
            )
                .lean()
                .exec()
        );
        rows.push({
            ...pick(
                voucher,
                'id code type value minOrderValue maxUsage currentUsage status startDate expiryDate'
            ),
            timesUsed: invoices.length,
            totalDiscountGiven: sum(invoices, 'voucherDiscount'),
            totalRevenueFromVoucher: sum(invoices, 'finalAmount')
        });
    }
    return page(
        rows.sort((a, b) => b.timesUsed - a.timesUsed || a.id - b.id),
        limit,
        offset
    );
};
exports.countVoucherReport = async () =>
    Voucher.countDocuments({})
        .session(options().session || null)
        .exec();
