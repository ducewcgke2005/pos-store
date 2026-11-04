const { CustomerPointLog, Invoice } = require('../models');
const { options, clean, insert } = require('./helpers');
exports.getPointLogsByCustomerId = async (
    customerId,
    { limit = 20, offset = 0 } = {}
) => {
    const rows = clean(
        await CustomerPointLog.find({ customerId }, null, options())
            .sort({ createdAt: -1, id: -1 })
            .skip(Number(offset))
            .limit(Number(limit))
            .lean()
            .exec()
    );
    for (const row of rows)
        row.invoiceCode =
            (
                await Invoice.findOne(
                    { id: row.invoiceId },
                    'invoiceCode',
                    options()
                )
                    .lean()
                    .exec()
            )?.invoiceCode || null;
    return rows;
};
exports.countPointLogsByCustomerId = async (customerId) =>
    CustomerPointLog.countDocuments({ customerId })
        .session(options().session || null)
        .exec();
exports.addPointLog = async ({
    customerId,
    invoiceId = null,
    pointChange,
    reason = null
}) => insert(CustomerPointLog, { customerId, invoiceId, pointChange, reason });
exports.insertPointLog = async (
    session,
    customerId,
    invoiceId,
    pointChange,
    reason
) =>
    insert(
        CustomerPointLog,
        { customerId, invoiceId, pointChange, reason },
        session
    );
