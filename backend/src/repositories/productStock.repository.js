const {
    InventoryStock,
    Product,
    Category,
    ProductUnit,
    SupplierProductPrice,
    ProductSupplier,
    Supplier
} = require('../models');
const {
    options,
    clean,
    regex,
    pick,
    page,
    ensureReferences
} = require('./helpers');
exports.getStockByProductId = async (session, productId) =>
    clean(
        await InventoryStock.findOne({ productId }, null, options(session))
            .lean()
            .exec()
    );
exports.decreaseStockIfAvailable = async (session, productId, quantity) => {
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0)
        throw new Error(`Invalid deduct quantity for product ${productId}`);
    return clean(
        await InventoryStock.findOneAndUpdate(
            { productId, quantityOnHand: { $gte: quantity } },
            { $inc: { quantityOnHand: -quantity } },
            { ...options(session), new: true }
        )
            .lean()
            .exec()
    );
};
exports.deductStock = async (session, productId, quantity) => {
    const row = await exports.decreaseStockIfAvailable(
        session,
        productId,
        quantity
    );
    if (!row) throw new Error(`Insufficient stock for product ${productId}`);
    return row;
};
exports.addStock = async (session, productId, quantity) => {
    await ensureReferences(InventoryStock, { productId }, session);
    return (
        await InventoryStock.updateOne(
            { productId },
            {
                $inc: { quantityOnHand: quantity },
                $setOnInsert: { minThreshold: 0 }
            },
            { ...options(session), upsert: true }
        ).exec()
    ).matchedCount;
};
exports.updateStock = async (session, productId, difference) => {
    if (difference === undefined) {
        difference = productId;
        productId = session;
        session = null;
    }
    const filter = {
        productId,
        ...(Number(difference) < 0
            ? { quantityOnHand: { $gte: -Number(difference) } }
            : {})
    };
    return (
        await InventoryStock.updateOne(
            filter,
            { $inc: { quantityOnHand: difference } },
            options(session)
        ).exec()
    ).matchedCount;
};
exports.getProductBasicInfo = async (id) =>
    clean(
        await Product.findOne({ id }, 'id allowDecimalQuantity -_id', options())
            .lean()
            .exec()
    );
exports.updateMinThreshold = async (productId, minThreshold) =>
    clean(
        await InventoryStock.findOneAndUpdate(
            { productId },
            { $set: { minThreshold } },
            { ...options(), new: true }
        )
            .lean()
            .exec()
    );
const categoryFilter = (categoryId, search) => ({
    categoryId,
    $or: [{ name: regex(search) }, { code: regex(search) }]
});
exports.getProductsByCategory = async (categoryId, search, limit, offset) => {
    const rows = clean(
        await Product.find(categoryFilter(categoryId, search), null, options())
            .sort({ name: 1, id: 1 })
            .skip(Number(offset))
            .limit(Number(limit))
            .lean()
            .exec()
    );
    const category = await Category.findOne({ id: categoryId }, null, options())
        .lean()
        .exec();
    const result = [];
    if (!category) return result;
    for (const row of rows) {
        const stock = await exports.getStockByProductId(null, row.id);
        result.push({
            ...pick(row, 'imageUrl allowDecimalQuantity baseUnit'),
            categoryName: category.name,
            productId: row.id,
            productName: row.name,
            productCode: row.code,
            quantityOnHand: stock?.quantityOnHand ?? null,
            minThreshold: stock?.minThreshold ?? null,
            stockStatus:
                stock && stock.quantityOnHand <= stock.minThreshold
                    ? 'LOW'
                    : 'NORMAL'
        });
    }
    return result;
};
exports.countProductsByCategory = async (categoryId, search) =>
    Product.countDocuments(categoryFilter(categoryId, search))
        .session(options().session || null)
        .exec();
exports.getProductsBySupplier = async (supplierId, search) => {
    const links = await ProductSupplier.find({ supplierId }, null, options())
        .lean()
        .exec();
    return clean(
        await Product.find(
            {
                id: { $in: links.map((row) => row.productId) },
                name: regex(search)
            },
            null,
            options()
        )
            .sort({ name: 1, id: 1 })
            .lean()
            .exec()
    );
};
exports.countProductsBySupplier = async (supplierId, search) =>
    (await exports.getProductsBySupplier(supplierId, search)).length;
exports.searchProducts = async (keyword) => {
    const products = clean(
        await Product.find(
            {
                status: 'Selling',
                $or: [{ name: regex(keyword) }, { code: regex(keyword) }]
            },
            null,
            options()
        )
            .sort({ name: 1, id: 1 })
            .limit(20)
            .lean()
            .exec()
    );
    const result = [];
    for (const product of products) {
        const stock = await exports.getStockByProductId(null, product.id);
        const unit = clean(
            await ProductUnit.findOne(
                { productId: product.id },
                null,
                options()
            )
                .sort({ conversionFactor: -1, id: 1 })
                .lean()
                .exec()
        );
        const quantityOnHand = stock?.quantityOnHand || 0;
        result.push({
            ...pick(product, 'id code name baseUnit allowDecimalQuantity'),
            quantityOnHand,
            largestUnitId: unit?.id || null,
            largestUnitName: unit?.unitName || null,
            largestConversionFactor: unit?.conversionFactor || null,
            systemLargest: unit
                ? Math.floor(quantityOnHand / unit.conversionFactor)
                : 0,
            systemRemainder: unit
                ? quantityOnHand % unit.conversionFactor
                : quantityOnHand
        });
    }
    return result;
};
exports.getLowStockProductUnits = async () => {
    const stocks = clean(
        await InventoryStock.find(
            { $expr: { $lte: ['$quantityOnHand', '$minThreshold'] } },
            null,
            options()
        )
            .sort({ quantityOnHand: 1, productId: 1 })
            .lean()
            .exec()
    );
    const result = [];
    for (const stock of stocks) {
        const product = await Product.findOne(
            { id: stock.productId },
            null,
            options()
        )
            .lean()
            .exec();
        const unit = clean(
            await ProductUnit.findOne(
                { productId: stock.productId },
                null,
                options()
            )
                .sort({ conversionFactor: -1, id: 1 })
                .lean()
                .exec()
        );
        if (
            !product ||
            !unit ||
            !(await SupplierProductPrice.exists({ unitId: unit.id }).session(
                options().session || null
            ))
        )
            continue;
        result.push({
            productUnitId: unit.id,
            unitName: unit.unitName,
            conversionFactor: unit.conversionFactor,
            productId: product.id,
            productName: product.name,
            stockQuantity: stock.quantityOnHand,
            minThreshold: stock.minThreshold
        });
    }
    return result;
};
exports.searchProductUnits = async (keyword) => {
    const products = await Product.find(
        { name: regex(keyword) },
        null,
        options()
    )
        .sort({ name: 1, id: 1 })
        .lean()
        .exec();
    const result = [];
    for (const product of products) {
        const units = await ProductUnit.find(
            { productId: product.id },
            null,
            options()
        )
            .sort({ id: 1 })
            .lean()
            .exec();
        for (const unit of units) {
            const price = clean(
                await SupplierProductPrice.findOne(
                    { productId: product.id, unitId: unit.id },
                    null,
                    options()
                )
                    .sort({ createdAt: -1, id: -1 })
                    .lean()
                    .exec()
            );
            if (price)
                result.push({
                    productUnitId: unit.id,
                    unitName: unit.unitName,
                    productId: product.id,
                    productName: product.name,
                    price: price.price,
                    createdAt: price.createdAt
                });
        }
    }
    return result;
};
