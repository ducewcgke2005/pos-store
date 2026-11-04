const {
    Return,
    ReturnItem,
    Invoice,
    Customer,
    Staff,
    Product
} = require('../models');
const {
    options,
    clean,
    insert,
    pick,
    page,
    ensureReferences
} = require('./helpers');
exports.getReturns = async (
    _session,
    { status, pageSize, offset, staffId }
) => {
    const filter = {
        ...(status ? { status } : {}),
        ...(staffId ? { staffId } : {})
    };
    const total = await Return.countDocuments(filter).session(
        options().session || null
    );
    const returns = clean(
        await Return.find(filter, null, options())
            .sort({ createdAt: -1, id: -1 })
            .skip(Number(offset))
            .limit(Number(pageSize))
            .lean()
            .exec()
    );
    const rows = [];
    for (const row of returns) {
        const invoice = await Invoice.findOne(
            { id: row.invoiceId },
            null,
            options()
        )
            .lean()
            .exec();
        const customer = await Customer.findOne(
            { id: invoice?.customerId },
            null,
            options()
        )
            .lean()
            .exec();
        const staff = await Staff.findOne({ id: row.staffId }, null, options())
            .lean()
            .exec();
        rows.push({
            ...pick(row, 'id invoiceId totalRefundAmount status createdAt'),
            invoiceCode: invoice?.invoiceCode || null,
            customerName: customer?.name || null,
            staffName: staff?.fullName || null
        });
    }
    return { total, rows };
};
exports.getReturnDetail = async (id) => {
    const ret = clean(
        await Return.findOne({ id }, null, options()).lean().exec()
    );
    if (!ret) return null;
    const invoice = await Invoice.findOne(
        { id: ret.invoiceId },
        null,
        options()
    )
        .lean()
        .exec();
    const customer = await Customer.findOne(
        { id: invoice?.customerId },
        null,
        options()
    )
        .lean()
        .exec();
    const items = clean(
        await ReturnItem.find({ returnId: id }, null, options())
            .sort({ id: 1 })
            .lean()
            .exec()
    );
    const returnItems = [];
    for (const row of items) {
        const product = await Product.findOne(
            { id: row.productId },
            null,
            options()
        )
            .lean()
            .exec();
        returnItems.push({
            id: row.productId,
            quantity: row.quantity,
            refundAmount: row.refundAmount,
            name: row.productName || product?.name || null,
            imageUrl: product?.imageUrl || null,
            unitName: row.unitName
        });
    }
    return {
        ...pick(ret, 'id reason status totalRefundAmount createdAt note'),
        invoiceCode: invoice?.invoiceCode || null,
        customerName: customer?.name || null,
        phone: customer?.phone || null,
        returnItems
    };
};
exports.getReturnsByInvoiceId = async (invoiceId) => {
    const returns = clean(
        await Return.find({ invoiceId }, null, options())
            .sort({ createdAt: -1, id: -1 })
            .lean()
            .exec()
    );
    const rows = [];
    for (const row of returns) {
        const items = clean(
            await ReturnItem.find({ returnId: row.id }, null, options())
                .sort({ id: 1 })
                .lean()
                .exec()
        );
        for (const item of items.length ? items : [null])
            rows.push({
                ...pick(
                    row,
                    'id invoiceId returnType refundMethod totalRefundAmount status createdAt'
                ),
                ...(item
                    ? pick(
                          item,
                          'invoiceItemId productId productName quantity refundAmount unitName productUnitId baseQuantity restockApproved'
                      )
                    : {}),
                returnItemId: item?.id || null
            });
    }
    return rows;
};
exports.createReturn = async (session, data) =>
    (
        await insert(
            Return,
            {
                ...pick(
                    data,
                    'invoiceId counterId staffId returnType refundMethod totalRefundAmount reason'
                ),
                status: 'Pending'
            },
            session
        )
    ).id;
exports.getReturnById = async (session, id) =>
    clean(await Return.findOne({ id }, null, options(session)).lean().exec());
exports.updateReturnStatus = async (session, id, data) => {
    const fields = Object.fromEntries(
        ['status', 'approveBy', 'approvedAt', 'note', 'totalRefundAmount']
            .filter((key) => data[key] !== undefined)
            .map((key) => [key, data[key]])
    );
    await ensureReferences(Return, fields, session);
    const result = await Return.updateOne(
        { id, status: 'Pending' },
        { $set: fields },
        options(session)
    ).exec();
    if (!result.matchedCount)
        throw new Error('Only PENDING return can be approved');
};
