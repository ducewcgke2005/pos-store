const {
    CustomerVoucherUsage,
    Customer,
    Invoice,
    Voucher
} = require('../models');
const { options, clean, insert, page } = require('./helpers');
exports.hasCustomerUsedVoucher = async (customerId, voucherId) =>
    Boolean(
        await CustomerVoucherUsage.exists({ customerId, voucherId }).session(
            options().session || null
        )
    );
exports.recordVoucherUsage = async (data) => insert(CustomerVoucherUsage, data);
exports.getUsageByVoucherId = async (
    voucherId,
    { limit = 20, offset = 0 } = {}
) => {
    const rows = clean(
        await CustomerVoucherUsage.find({ voucherId }, null, options())
            .sort({ usedAt: -1, id: -1 })
            .lean()
            .exec()
    );
    const result = [];
    for (const row of rows) {
        const customer = await Customer.findOne(
            { id: row.customerId },
            null,
            options()
        )
            .lean()
            .exec();
        const invoice = clean(
            await Invoice.findOne({ id: row.invoiceId }, null, options())
                .lean()
                .exec()
        );
        if (customer && invoice)
            result.push({
                id: row.id,
                usedAt: row.usedAt,
                customerId: customer.id,
                customerName: customer.name,
                customerPhone: customer.phone,
                invoiceId: invoice.id,
                invoiceCode: invoice.invoiceCode,
                voucherDiscount: invoice.voucherDiscount,
                finalAmount: invoice.finalAmount
            });
    }
    return page(result, limit, offset);
};
exports.getVoucherUsageReport = async (pagination) => {
    const rows = await require('./voucher.repository').getVoucherReport(
        pagination
    );
    return rows.map(
        ({ id, totalRevenueFromVoucher, minOrderValue, ...row }) => ({
            voucherId: id,
            ...row
        })
    );
};
exports.countVoucherUsageReport = async () =>
    Voucher.countDocuments({})
        .session(options().session || null)
        .exec();
