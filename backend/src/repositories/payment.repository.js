const { Payment } = require('../models');
const { options, clean, insert } = require('./helpers');
exports.insertPayment = async (session, data) => insert(Payment, data, session);
exports.updatePaymentStatus = async (
    session,
    invoiceId,
    status,
    transactionId
) => {
    const data = { status };
    if (transactionId != null) data.transactionId = String(transactionId);
    await Payment.updateOne(
        { invoiceId },
        { $set: data },
        options(session)
    ).exec();
};
exports.updatePaymentSuccess = async (session, id, status) =>
    Payment.updateOne({ id }, { $set: { status } }, options(session)).exec();
exports.updatePayment = async (
    session,
    { invoiceId, amount, paymentMethod, status }
) =>
    (
        await Payment.updateOne(
            { invoiceId },
            { $set: { amount, paymentMethod, status } },
            options(session)
        ).exec()
    ).matchedCount;
exports.findByTransactionId = async (session, transactionId) =>
    clean(
        await Payment.findOne(
            { transactionId: String(transactionId) },
            null,
            options(session)
        )
            .lean()
            .exec()
    );
exports.updatePaymentCancel = async (session, invoiceId, status) =>
    Payment.updateOne(
        { invoiceId, status: 'PENDING' },
        { $set: { status } },
        options(session)
    ).exec();
exports.findLatestPendingPayment = async (session, invoiceId) =>
    clean(
        await Payment.findOne(
            { invoiceId, status: 'PENDING' },
            null,
            options(session)
        )
            .sort({ createdAt: -1, id: -1 })
            .lean()
            .exec()
    );
exports.cancelPendingPayments = async (session, invoiceId) =>
    (
        await Payment.updateMany(
            { invoiceId, status: 'PENDING' },
            { $set: { status: 'CANCELLED' } },
            options(session)
        ).exec()
    ).modifiedCount;
