const { VnPayTransaction } = require('../models');
const { insert, options } = require('./helpers');
exports.createVnPayTransaction = async (data) =>
    insert(VnPayTransaction, { ...data, status: 'INIT' });
exports.updateVnPayStatus = async (invoiceId, status, responseCode) =>
    VnPayTransaction.updateMany(
        { invoiceId },
        { $set: { status, responseCode } },
        options()
    ).exec();
