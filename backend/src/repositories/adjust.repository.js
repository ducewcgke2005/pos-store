const {
    Adjustment,
    AdjustmentItem,
    InventoryStock,
    ProductUnit,
    Product,
    Staff
} = require('../models');
const { options, clean, insert, pick } = require('./helpers');
const stocks = require('./productStock.repository');
exports.checkProductInPending = async (productId) => {
    const pending = await Adjustment.find(
        { status: 'Pending' },
        'id',
        options()
    )
        .lean()
        .exec();
    return Boolean(
        await AdjustmentItem.exists({
            productId,
            adjustmentId: { $in: pending.map((row) => row.id) }
        }).session(options().session || null)
    );
};
exports.createAdjustmentWithItems = async (createdBy, reason, items) => {
    const pending = [];
    for (const item of items)
        if (await exports.checkProductInPending(item.productId))
            pending.push(item.productId);
    if (pending.length)
        throw new Error(
            `Các sản phẩm đang nằm trong phiếu Pending: ${pending.join(', ')}`
        );
    const adjustment = await insert(Adjustment, { createdBy, reason });
    for (const item of items) {
        // Serialize concurrent requests against the same product's adjustment snapshot.
        const stock = clean(
            await InventoryStock.findOneAndUpdate(
                { productId: item.productId },
                { $inc: { quantityOnHand: 0 } },
                { ...options(), new: true }
            )
                .lean()
                .exec()
        );
        if (!stock)
            throw new Error(
                `Không tìm thấy tồn kho của productId ${item.productId}`
            );
        const unit = await ProductUnit.findOne(
            { productId: item.productId },
            null,
            options()
        )
            .sort({ conversionFactor: -1, id: 1 })
            .lean()
            .exec();
        if (!unit)
            throw new Error(
                `Không tìm thấy đơn vị sản phẩm cho productId ${item.productId}`
            );
        const actualQuantity =
            Number(item.actualLargest || 0) * unit.conversionFactor +
            Number(item.actualRemainder || 0);
        await insert(AdjustmentItem, {
            adjustmentId: adjustment.id,
            productId: item.productId,
            systemQuantity: stock.quantityOnHand,
            actualQuantity
        });
    }
    return adjustment.id;
};
exports.updateStatusTransaction = async (id, processedBy, status) => {
    const current = await Adjustment.findOne({ id }, null, options())
        .lean()
        .exec();
    if (!current) throw new Error('Phiếu không tồn tại');
    if (current.status !== 'Pending') throw new Error('Phiếu đã được xử lý');
    const changed = await Adjustment.updateOne(
        { id, status: 'Pending' },
        { $set: { status, processedBy, processedAt: new Date() } },
        options()
    ).exec();
    if (!changed.matchedCount) throw new Error('Phiếu đã được xử lý');
    if (status === 'Approved')
        for (const item of clean(
            await AdjustmentItem.find({ adjustmentId: id }, null, options())
                .lean()
                .exec()
        )) {
            if (
                !(await stocks.updateStock(
                    null,
                    item.productId,
                    item.actualQuantity - item.systemQuantity
                ))
            )
                throw new Error(
                    `Không tìm thấy tồn kho của productId ${item.productId}`
                );
        }
    return { adjustmentId: id, status };
};
const joined = async (row) => {
    if (!row) return null;
    const createdByName =
        (
            await Staff.findOne({ id: row.createdBy }, null, options())
                .lean()
                .exec()
        )?.fullName || null;
    const processedByName =
        (
            await Staff.findOne({ id: row.processedBy }, null, options())
                .lean()
                .exec()
        )?.fullName || null;
    return {
        ...pick(row, 'id reason status createdAt processedAt'),
        createdByName,
        processedByName
    };
};
exports.getAdjustments = async (filters = {}) => {
    const filter = {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.fromDate || filters.toDate
            ? {
                  createdAt: {
                      ...(filters.fromDate
                          ? { $gte: new Date(filters.fromDate) }
                          : {}),
                      ...(filters.toDate
                          ? { $lte: new Date(filters.toDate) }
                          : {})
                  }
              }
            : {})
    };
    const result = [];
    for (const row of clean(
        await Adjustment.find(filter, null, options())
            .sort({ createdAt: -1, id: -1 })
            .lean()
            .exec()
    ))
        result.push(await joined(row));
    return result;
};
exports.getAdjustmentDetail = async (id) => {
    const header = await joined(
        clean(await Adjustment.findOne({ id }, null, options()).lean().exec())
    );
    if (!header) return null;
    const rows = clean(
        await AdjustmentItem.find({ adjustmentId: id }, null, options())
            .sort({ id: 1 })
            .lean()
            .exec()
    );
    const items = [];
    for (const row of rows) {
        const product = await Product.findOne(
            { id: row.productId },
            null,
            options()
        )
            .lean()
            .exec();
        if (!product) continue;
        const unit = await ProductUnit.findOne(
            { productId: row.productId },
            null,
            options()
        )
            .sort({ conversionFactor: -1, id: 1 })
            .lean()
            .exec();
        const difference = row.actualQuantity - row.systemQuantity;
        const result = {
            ...pick(row, 'productId systemQuantity actualQuantity'),
            ...pick(product, 'name code baseUnit'),
            difference,
            unitName: unit?.unitName || null
        };
        for (const [prefix, quantity] of [
            ['system', row.systemQuantity],
            ['actual', row.actualQuantity],
            ['difference', difference]
        ]) {
            result[`${prefix}Largest`] = unit
                ? Math.floor(quantity / unit.conversionFactor)
                : quantity;
            result[`${prefix}Remainder`] = unit
                ? quantity -
                  Math.floor(quantity / unit.conversionFactor) *
                      unit.conversionFactor
                : 0;
        }
        items.push(result);
    }
    return { ...header, items };
};
