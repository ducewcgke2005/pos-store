const {
    PriceHistory,
    ProductUnit,
    Staff,
    PurchaseOrderItem,
    PurchaseOrder,
    Supplier
} = require('../../models');
const { options, clean, insert } = require('../helpers');
exports.insertSaleHistory = async (data) => insert(PriceHistory, data);
exports.getAllSaleByProductId = async (productId) => {
    const rows = clean(
        await PriceHistory.find({ productId }, null, options())
            .sort({ changedAt: -1, id: -1 })
            .lean()
            .exec()
    );
    for (const row of rows) {
        row.unitName =
            (
                await ProductUnit.findOne(
                    { id: row.productUnitId, productId },
                    null,
                    options()
                )
                    .lean()
                    .exec()
            )?.unitName || null;
        row.changedByName =
            (
                await Staff.findOne({ id: row.changedBy }, null, options())
                    .lean()
                    .exec()
            )?.fullName || null;
    }
    return rows;
};
exports.getLatestSaleByProductId = async (productId) =>
    (await exports.getAllSaleByProductId(productId))[0] || null;
exports.getAllCostByProductId = async (productId) => {
    const units = await ProductUnit.find({ productId }, null, options())
        .lean()
        .exec();
    const rows = clean(
        await PurchaseOrderItem.find(
            { productUnitId: { $in: units.map((row) => row.id) } },
            null,
            options()
        )
            .sort({ id: -1 })
            .lean()
            .exec()
    );
    const result = [];
    for (const row of rows) {
        const order = await PurchaseOrder.findOne(
            { id: row.poId, status: 'Received' },
            null,
            options()
        )
            .lean()
            .exec();
        if (!order) continue;
        const supplier = await Supplier.findOne(
            { id: order.supplierId },
            null,
            options()
        )
            .lean()
            .exec();
        const staff = await Staff.findOne(
            { id: order.createdBy },
            null,
            options()
        )
            .lean()
            .exec();
        result.push({
            id: row.id,
            productId: Number(productId),
            costPrice: row.costPrice,
            quantityOrdered: row.quantity,
            baseUnit:
                units.find((unit) => unit.id === row.productUnitId)?.unitName ||
                null,
            purchaseOrderId: order.id,
            changedAt: order.createdAt,
            supplierName: supplier?.name || null,
            changedByName: staff?.fullName || null
        });
    }
    return result.sort((a, b) => b.changedAt - a.changedAt || b.id - a.id);
};
exports.getLatestCostByProductId = async (productId) =>
    (await exports.getAllCostByProductId(productId))[0] || null;
