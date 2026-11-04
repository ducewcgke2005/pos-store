const {
    PurchaseOrder,
    PurchaseOrderItem,
    ProductUnit,
    Product,
    SupplierProductPrice,
    ProductSupplier,
    Supplier,
    Staff
} = require('../models');
const { options, clean, insert, pick, ensureReferences } = require('./helpers');
const stocks = require('./productStock.repository');
const orderFilter = (filters = {}) => ({
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.fromDate || filters.toDate
        ? {
              createdAt: {
                  ...(filters.fromDate
                      ? { $gte: new Date(filters.fromDate) }
                      : {}),
                  ...(filters.toDate ? { $lte: new Date(filters.toDate) } : {})
              }
          }
        : {})
});
const joinedOrder = async (row) => {
    if (!row) return null;
    const supplier = await Supplier.findOne(
        { id: row.supplierId },
        null,
        options()
    )
        .lean()
        .exec();
    const joined = { ...row, supplierName: supplier?.name || null };
    for (const key of ['createdBy', 'processBy', 'receivedBy'])
        joined[`${key}Name`] =
            (
                await Staff.findOne({ id: row[key] }, null, options())
                    .lean()
                    .exec()
            )?.fullName || null;
    return joined;
};
exports.createPurchaseOrder = async (createdBy, supplierId, note) =>
    pick(
        await insert(PurchaseOrder, {
            createdBy,
            supplierId,
            note,
            status: 'Pending'
        }),
        'id'
    );
exports.createPurchaseOrderItem = async (
    poId,
    productUnitId,
    quantity,
    costPrice
) => insert(PurchaseOrderItem, { poId, productUnitId, quantity, costPrice });
exports.getSupplierPrice = async (supplierId, unitId) => {
    const row = clean(
        await SupplierProductPrice.findOne(
            { supplierId, unitId },
            null,
            options()
        )
            .sort({ createdAt: -1, id: -1 })
            .lean()
            .exec()
    );
    return row && { price: row.price };
};
exports.updatePurchaseOrderTotal = async (id, totalAmount) =>
    PurchaseOrder.updateOne(
        { id },
        { $set: { totalAmount } },
        options()
    ).exec();
exports.getPurchaseOrderItems = async (poId) => {
    const rows = clean(
        await PurchaseOrderItem.find({ poId }, null, options())
            .sort({ id: 1 })
            .lean()
            .exec()
    );
    const result = [];
    for (const row of rows) {
        const unit = await ProductUnit.findOne(
            { id: row.productUnitId },
            null,
            options()
        )
            .lean()
            .exec();
        const product = await Product.findOne(
            { id: unit?.productId },
            null,
            options()
        )
            .lean()
            .exec();
        if (unit && product)
            result.push({
                ...pick(
                    row,
                    'id productUnitId quantity receivedQuantity costPrice'
                ),
                productId: product.id,
                productName: product.name,
                unitName: unit.unitName
            });
    }
    return result;
};
exports.updateStatus = async (id, status, processBy) => {
    await ensureReferences(PurchaseOrder, { processBy });
    await PurchaseOrder.updateOne(
        { id },
        {
            $set: {
                status,
                processBy,
                ...(['Rejected', 'CannotDeliver'].includes(status)
                    ? { totalAmount: 0 }
                    : {})
            }
        },
        options()
    ).exec();
    return { poId: id, status };
};
exports.receiveOrder = async (poId, items, status, receivedBy) => {
    await ensureReferences(PurchaseOrder, { receivedBy });
    const order = await PurchaseOrder.findOne({ id: poId }, null, options())
        .lean()
        .exec();
    if (!order) throw new Error('PO_NOT_FOUND');
    for (const item of items) {
        const row = clean(
            await PurchaseOrderItem.findOne(
                { id: item.poiId, poId },
                null,
                options()
            )
                .lean()
                .exec()
        );
        const unit = row
            ? await ProductUnit.findOne(
                  { id: row.productUnitId },
                  null,
                  options()
              )
                  .lean()
                  .exec()
            : null;
        if (!row || !unit) throw new Error('PO_ITEM_NOT_FOUND');
        const quantity = Number(item.receivedQuantity);
        if (!Number.isFinite(quantity) || quantity <= 0)
            throw new Error('INVALID_RECEIVED_QUANTITY');
        const remaining = row.quantity - row.receivedQuantity;
        if (quantity > remaining) throw new Error('RECEIVED_EXCEEDS_ORDER');
        const result = await PurchaseOrderItem.updateOne(
            {
                id: row.id,
                poId,
                receivedQuantity: { $lte: row.quantity - quantity }
            },
            { $inc: { receivedQuantity: quantity } },
            options()
        ).exec();
        if (!result.matchedCount) throw new Error('RECEIVED_EXCEEDS_ORDER');
        await stocks.addStock(
            null,
            unit.productId,
            quantity * unit.conversionFactor
        );
    }
    const allItems = clean(
        await PurchaseOrderItem.find({ poId }, null, options()).lean().exec()
    );
    status = allItems.every((row) => row.receivedQuantity >= row.quantity)
        ? 'Received'
        : 'PartiallyReceived';
    const totalAmount = allItems.reduce(
        (sum, row) => sum + row.receivedQuantity * row.costPrice,
        0
    );
    await PurchaseOrder.updateOne(
        { id: poId },
        { $set: { status, receivedBy, totalAmount } },
        options()
    ).exec();
    return { poId, status };
};
exports.getPurchaseOrderById = async (id) =>
    joinedOrder(
        clean(
            await PurchaseOrder.findOne({ id }, null, options()).lean().exec()
        )
    );
exports.getPurchaseOrders = async (offset, limit, filters) => {
    const rows = clean(
        await PurchaseOrder.find(orderFilter(filters), null, options())
            .sort({ createdAt: -1, id: -1 })
            .skip(Number(offset))
            .limit(Number(limit))
            .lean()
            .exec()
    );
    const result = [];
    for (const row of rows) result.push(await joinedOrder(row));
    return result;
};
exports.countPurchaseOrders = async (filters) =>
    PurchaseOrder.countDocuments(orderFilter(filters))
        .session(options().session || null)
        .exec();
exports.getSuppliersByProductUnit = async (productUnitId) => {
    const unit = await ProductUnit.findOne(
        { id: productUnitId },
        null,
        options()
    )
        .lean()
        .exec();
    if (!unit) return [];
    const product = await Product.findOne(
        { id: unit.productId },
        null,
        options()
    )
        .lean()
        .exec();
    const links = await ProductSupplier.find(
        { productId: unit.productId, status: { $in: ['ACTIVE', 'active'] } },
        null,
        options()
    )
        .lean()
        .exec();
    const rows = [];
    for (const link of links) {
        const supplier = await Supplier.findOne(
            { id: link.supplierId },
            null,
            options()
        )
            .lean()
            .exec();
        const price = clean(
            await SupplierProductPrice.findOne(
                {
                    supplierId: link.supplierId,
                    productId: unit.productId,
                    unitId: unit.id
                },
                null,
                options()
            )
                .sort({ createdAt: -1, id: -1 })
                .lean()
                .exec()
        );
        if (supplier && product && price)
            rows.push({
                supplierId: supplier.id,
                supplierName: supplier.name,
                productUnitId: unit.id,
                productName: product.name,
                unitName: unit.unitName,
                price: price.price,
                createdAt: price.createdAt
            });
    }
    return rows.sort(
        (a, b) => a.price - b.price || a.supplierId - b.supplierId
    );
};
