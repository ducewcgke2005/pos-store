const { ReturnItem, Return } = require('../models');
const {
    options,
    clean,
    insert,
    pick,
    page,
    ensureReferences
} = require('./helpers');
exports.createReturnItem = async (session, returnId, item) =>
    insert(
        ReturnItem,
        {
            returnId,
            ...pick(
                item,
                'invoiceItemId productId productUnitId productName unitName quantity baseQuantity refundAmount'
            )
        },
        session
    );
exports.updateItemRefundAmount = async (session, id, refundAmount) =>
    ReturnItem.updateOne(
        { id },
        { $set: { refundAmount } },
        options(session)
    ).exec();
exports.getItemsByReturnId = async (session, returnId) =>
    clean(
        await ReturnItem.find({ returnId }, null, options(session))
            .sort({ id: 1 })
            .lean()
            .exec()
    );
exports.getReturnById = async (session, id) =>
    clean(await Return.findOne({ id }, null, options(session)).lean().exec());
exports.getReturnItemById = async (session, id) =>
    clean(
        await ReturnItem.findOne({ id }, null, options(session)).lean().exec()
    );
exports.updateRestockApprovedByReturnId = async (
    session,
    returnId,
    restockApproved
) =>
    ReturnItem.updateMany(
        { returnId },
        { $set: { restockApproved } },
        options(session)
    ).exec();
exports.getReturnItems = async (
    _session,
    { status = 'Pending', pageSize, offset }
) => {
    const restockApproved =
        status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
    const items = clean(
        await ReturnItem.find({ restockApproved }, null, options())
            .lean()
            .exec()
    );
    const rows = [];
    for (const item of items) {
        const ret = await Return.findOne({ id: item.returnId }, null, options())
            .lean()
            .exec();
        if (ret)
            rows.push({
                ...pick(
                    item,
                    'id returnId productName quantity restockApproved unitName baseQuantity'
                ),
                createdAt: ret.createdAt
            });
    }
    return {
        total: items.length,
        rows: page(
            rows.sort((a, b) => b.createdAt - a.createdAt || b.id - a.id),
            pageSize,
            offset
        )
    };
};
exports.updateRestockStatus = async (
    session,
    id,
    checkedBy,
    restockApproved
) => {
    await ensureReferences(ReturnItem, { checkedBy }, session);
    const result = await ReturnItem.updateOne(
        { id, restockApproved: 'Pending' },
        { $set: { restockApproved, checkedBy, checkedAt: new Date() } },
        options(session)
    ).exec();
    if (!result.matchedCount) throw new Error('Item already processed');
};
