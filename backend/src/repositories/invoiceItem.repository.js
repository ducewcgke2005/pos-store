const { InvoiceItem } = require('../models');
const { insert, options, clean } = require('./helpers');
exports.createItem = async (data) => insert(InvoiceItem, data);
exports.getByInvoiceId = async (invoiceId) =>
    clean(
        await InvoiceItem.find({ invoiceId }, null, options())
            .sort({ id: 1 })
            .lean()
            .exec()
    );
