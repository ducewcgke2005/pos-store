const { Customer, Invoice, InvoiceItem } = require('../models');
const { options, clean, insert, regex, pick } = require('./helpers');
const filterCustomers = ({ search = '', status } = {}) => ({
    ...(status ? { status } : {}),
    ...(search
        ? { $or: [{ name: regex(search) }, { phone: regex(search) }] }
        : {})
});
exports.getCustomers = async ({ limit = 10, offset = 0, ...filters } = {}) => {
    const rows = clean(
        await Customer.find(filterCustomers(filters), null, options())
            .sort({ createdAt: -1, id: -1 })
            .skip(Number(offset))
            .limit(Number(limit))
            .lean()
            .exec()
    );
    for (const row of rows) {
        const invoices = clean(
            await Invoice.find(
                { customerId: row.id, status: 'PAID' },
                'finalAmount',
                options()
            )
                .lean()
                .exec()
        );
        row.totalSpending = invoices.reduce(
            (sum, invoice) => sum + invoice.finalAmount,
            0
        );
    }
    return rows;
};
exports.countCustomers = async (filters) =>
    Customer.countDocuments(filterCustomers(filters))
        .session(options().session || null)
        .exec();
exports.getCustomerById = async (id) =>
    clean(await Customer.findOne({ id }, null, options()).lean().exec());
exports.createCustomer = async (data) => {
    try {
        return await insert(Customer, {
            ...pick(data, 'name phone'),
            ...Object.fromEntries(
                ['status', 'loyaltyPoints', 'totalSpending']
                    .filter((k) => data[k] !== undefined)
                    .map((k) => [k, data[k]])
            )
        });
    } catch (error) {
        if (error.code === 11000) throw new Error('Số điện thoại đã tồn tại');
        throw error;
    }
};
exports.updateCustomer = async (id, data) => {
    const fields = Object.fromEntries(
        ['name', 'phone', 'status', 'loyaltyPoints', 'totalSpending']
            .filter((k) => data[k] !== undefined)
            .map((k) => [k, data[k]])
    );
    if (!Object.keys(fields).length) return null;
    try {
        return clean(
            await Customer.findOneAndUpdate(
                { id },
                { $set: fields },
                { ...options(), new: true }
            )
                .lean()
                .exec()
        );
    } catch (error) {
        if (error.code === 11000) throw new Error('Số điện thoại đã tồn tại');
        throw error;
    }
};
exports.deleteCustomer = async (id) =>
    clean(
        await Customer.findOneAndUpdate(
            { id },
            { $set: { status: 'Inactive' } },
            { ...options(), new: true }
        )
            .lean()
            .exec()
    );
exports.getCustomerByPhone = async (phone) =>
    clean(await Customer.findOne({ phone }, null, options()).lean().exec());
exports.searchCustomersByPhone = async (phone) =>
    clean(
        await Customer.find(
            { phone: regex(phone) },
            'id phone name loyaltyPoints totalSpending status -_id',
            options()
        )
            .sort({ createdAt: -1, id: -1 })
            .limit(10)
            .lean()
            .exec()
    );
exports.getPurchaseHistory = async (
    customerId,
    { limit = 10, offset = 0 } = {}
) => {
    const rows = clean(
        await Invoice.find(
            { customerId },
            'id invoiceCode totalAmount promotionDiscount voucherDiscount pointDiscount usedPoints finalAmount status createdAt -_id',
            options()
        )
            .sort({ createdAt: -1, id: -1 })
            .skip(Number(offset))
            .limit(Number(limit))
            .lean()
            .exec()
    );
    for (const row of rows)
        row.itemCount = await InvoiceItem.countDocuments({
            invoiceId: row.id
        }).session(options().session || null);
    return rows;
};
exports.countPurchaseHistory = async (customerId) =>
    Invoice.countDocuments({ customerId })
        .session(options().session || null)
        .exec();
exports.getCustomerForUpdate = async (session, customerId) =>
    clean(
        await Customer.findOne(
            { id: customerId },
            'id loyaltyPoints',
            options(session)
        )
            .lean()
            .exec()
    );
exports.updateCustomerPoints = async (session, customerId, newPoints) =>
    Customer.updateOne(
        { id: customerId },
        { $set: { loyaltyPoints: newPoints } },
        options(session)
    ).exec();
