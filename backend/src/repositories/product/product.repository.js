const {
    Product,
    ProductUnit,
    Category,
    InventoryStock,
    ProductCombo,
    PurchaseOrder,
    PurchaseOrderItem,
    PriceHistory
} = require('../../models');
const {
    options,
    clean,
    insert,
    ensureReferences,
    regex,
    pick,
    translateError
} = require('../helpers');
const categories = require('../category.repository');

const productFilter = async ({
    search = '',
    categoryId,
    status = 'Selling'
} = {}) => {
    const filter = { ...(status ? { status } : {}) };
    if (categoryId)
        filter.categoryId = {
            $in: await categories.getDescendantIds([categoryId])
        };
    if (search) {
        const units = await ProductUnit.find(
            { $or: [{ barcode: regex(search) }, { unitName: regex(search) }] },
            'productId',
            options()
        )
            .lean()
            .exec();
        filter.$or = [
            { name: regex(search) },
            { code: regex(search) },
            { id: { $in: units.map((row) => row.productId) } }
        ];
    }
    return filter;
};
const latestCost = async (productId) => {
    const units = await ProductUnit.find({ productId }, null, options())
        .lean()
        .exec();
    const orders = await PurchaseOrder.find(
        { status: 'Received' },
        'id createdAt',
        options()
    )
        .sort({ createdAt: -1, id: -1 })
        .lean()
        .exec();
    for (const order of orders) {
        const item = clean(
            await PurchaseOrderItem.findOne(
                {
                    poId: order.id,
                    productUnitId: { $in: units.map((row) => row.id) }
                },
                null,
                options()
            )
                .sort({ id: -1 })
                .lean()
                .exec()
        );
        if (item)
            return Math.round(
                item.costPrice /
                    units.find((row) => row.id === item.productUnitId)
                        .conversionFactor
            );
    }
    return 0;
};
exports.getLatestCost = latestCost;
const summary = async (product) => {
    if (!product) return null;
    const category = await Category.findOne(
        { id: product.categoryId },
        null,
        options()
    )
        .lean()
        .exec();
    const unit = clean(
        await ProductUnit.findOne(
            { productId: product.id, conversionFactor: 1 },
            null,
            options()
        )
            .lean()
            .exec()
    );
    const stock = clean(
        await InventoryStock.findOne({ productId: product.id }, null, options())
            .lean()
            .exec()
    );
    let costPrice = await latestCost(product.id);
    if (product.isCombo) {
        costPrice = 0;
        const children = await ProductCombo.find(
            { parentProductId: product.id },
            null,
            options()
        )
            .lean()
            .exec();
        for (const child of children)
            costPrice +=
                child.quantity * (await latestCost(child.childProductId));
    }
    return {
        ...pick(
            product,
            'id code name imageUrl baseUnit allowDecimalQuantity isCombo status categoryId'
        ),
        categoryName: category?.name || null,
        baseUnitId: unit?.id || null,
        barcode: unit?.barcode || null,
        salePrice: unit?.salePrice ?? null,
        costPrice,
        minThreshold: stock?.minThreshold || 0,
        stockQuantity: stock?.quantityOnHand || 0
    };
};
exports.getProducts = async ({ limit = 10, offset = 0, ...filters } = {}) => {
    const rows = clean(
        await Product.find(await productFilter(filters), null, options())
            .sort({ createdAt: -1, id: -1 })
            .skip(Number(offset))
            .limit(Number(limit))
            .lean()
            .exec()
    );
    const data = [];
    for (const row of rows) {
        const dataRow = await summary(row);
        delete dataRow.minThreshold;
        data.push(dataRow);
    }
    return data;
};
exports.countProducts = async (filters) =>
    Product.countDocuments(await productFilter(filters))
        .session(options().session || null)
        .exec();
exports.getProductById = async (id) =>
    summary(
        clean(await Product.findOne({ id }, null, options()).lean().exec())
    );
exports.getProductDetail = async (id) => {
    const product = await exports.getProductById(id);
    if (!product) return null;
    const units = clean(
        await ProductUnit.find(
            { productId: id },
            'id unitName unitType conversionFactor salePrice barcode -_id',
            options()
        )
            .sort({ conversionFactor: 1, id: 1 })
            .lean()
            .exec()
    );
    return {
        ...product,
        hasMultiUnit: units.length > 1,
        units: units.map((row) => ({
            ...row,
            price: row.salePrice,
            isBaseUnit: row.conversionFactor === 1
        }))
    };
};
exports.getProductByBarcode = async (barcode) => {
    const unit = clean(
        await ProductUnit.findOne({ barcode }, null, options()).lean().exec()
    );
    if (!unit) return null;
    const product = await exports.getProductById(unit.productId);
    if (!product) return null;
    let stockQuantity = product.stockQuantity;
    if (product.isCombo) {
        const children = await ProductCombo.find(
            { parentProductId: product.id },
            null,
            options()
        )
            .lean()
            .exec();
        const available = [];
        for (const child of children) {
            const stock = clean(
                await InventoryStock.findOne(
                    { productId: child.childProductId },
                    null,
                    options()
                )
                    .lean()
                    .exec()
            );
            available.push(
                Math.floor((stock?.quantityOnHand || 0) / child.quantity)
            );
        }
        stockQuantity = available.length ? Math.min(...available) : 0;
    }
    return {
        ...pick(
            product,
            'code name baseUnit allowDecimalQuantity isCombo status costPrice'
        ),
        productId: product.id,
        productUnitId: unit.id,
        ...pick(unit, 'unitName unitType conversionFactor salePrice barcode'),
        price: unit.salePrice,
        stockQuantity
    };
};
exports.getProductWithBarcode = exports.getProductByBarcode;
exports.createProduct = async (data) => {
    const fields = {
        ...pick(data, 'code name categoryId baseUnit imageUrl'),
        allowDecimalQuantity: Boolean(data.allowDecimalQuantity),
        isCombo: Boolean(data.isCombo),
        status: data.status || 'Selling'
    };
    const product = await insert(Product, fields);
    const unit = await insert(ProductUnit, {
        productId: product.id,
        unitName: data.baseUnit,
        unitType:
            data.unitType || (data.allowDecimalQuantity ? 'WEIGHT' : 'PIECE'),
        conversionFactor: 1,
        salePrice: Number(data.salePrice || 0),
        barcode: data.barcode?.trim() || null
    });
    await insert(PriceHistory, {
        productId: product.id,
        productUnitId: unit.id,
        oldSalePrice: null,
        newSalePrice: Number(data.salePrice || 0),
        changedBy: data.createdBy || null
    });
    await insert(InventoryStock, {
        productId: product.id,
        quantityOnHand: 0,
        minThreshold: Number(data.minThreshold || 0)
    });
    return product.id;
};
exports.updateProduct = async (id, data) => {
    const fields = {
        ...pick(data, 'code name categoryId baseUnit imageUrl'),
        allowDecimalQuantity: Boolean(data.allowDecimalQuantity),
        isCombo: Boolean(data.isCombo),
        status: data.status || 'Selling'
    };
    await ensureReferences(Product, fields);
    const updated = await Product.updateOne(
        { id },
        { $set: fields },
        options()
    ).exec();
    if (!updated.matchedCount) return false;
    const unit = clean(
        await ProductUnit.findOne(
            { productId: id, conversionFactor: 1 },
            null,
            options()
        )
            .lean()
            .exec()
    );
    const unitFields = {
        unitName: data.baseUnit,
        unitType:
            data.unitType || (data.allowDecimalQuantity ? 'WEIGHT' : 'PIECE'),
        salePrice: Number(data.salePrice || 0),
        barcode: data.barcode?.trim() || null
    };
    let unitId = unit?.id;
    if (unit)
        await ProductUnit.updateOne(
            { id: unit.id },
            { $set: unitFields },
            options()
        ).exec();
    else
        unitId = (
            await insert(ProductUnit, {
                ...unitFields,
                productId: id,
                conversionFactor: 1
            })
        ).id;
    if (!unit || unit.salePrice !== unitFields.salePrice)
        await insert(PriceHistory, {
            productId: id,
            productUnitId: unitId,
            oldSalePrice: unit?.salePrice ?? null,
            newSalePrice: unitFields.salePrice,
            changedBy: data.updatedBy || null
        });
    await InventoryStock.updateOne(
        { productId: id },
        {
            $set: { minThreshold: Number(data.minThreshold || 0) },
            $setOnInsert: { quantityOnHand: 0 }
        },
        { ...options(), upsert: true }
    ).exec();
    return true;
};
exports.stopSellingProduct = async (id) =>
    Boolean(
        (
            await Product.updateOne(
                { id },
                { $set: { status: 'StopSelling' } },
                options()
            ).exec()
        ).matchedCount
    );
exports.startSellingProduct = async (id) =>
    Boolean(
        (
            await Product.updateOne(
                { id },
                { $set: { status: 'Selling' } },
                options()
            ).exec()
        ).matchedCount
    );
const posRows = async (products, barcode) => {
    const rows = [];
    for (const product of products) {
        const units = clean(
            await ProductUnit.find(
                { productId: product.id, ...(barcode ? { barcode } : {}) },
                null,
                options()
            )
                .sort({ conversionFactor: 1, id: 1 })
                .lean()
                .exec()
        );
        const stock = clean(
            await InventoryStock.findOne(
                { productId: product.id },
                null,
                options()
            )
                .lean()
                .exec()
        );
        for (const unit of units.length ? units : [null])
            rows.push({
                ...pick(product, 'id name code imageUrl categoryId'),
                stock: stock?.quantityOnHand || 0,
                minThreshold: stock?.minThreshold ?? null,
                unitId: unit?.id || null,
                unitName: unit?.unitName || null,
                factor: unit?.conversionFactor || null,
                barcode: unit?.barcode || null,
                price: unit?.salePrice ?? null,
                unitType: unit?.unitType || null
            });
    }
    return rows;
};
exports.getAllProducts = async ({ page = 1, pageSize = 10, ...filters }) => {
    const filter = await productFilter({
        ...filters,
        status: filters.status || 'Selling'
    });
    const total = await Product.countDocuments(filter).session(
        options().session || null
    );
    const products = clean(
        await Product.find(filter, null, options())
            .sort({ id: 1 })
            .skip((page - 1) * pageSize)
            .limit(Number(pageSize))
            .lean()
            .exec()
    );
    return { total, data: await posRows(products) };
};
exports.getBarcodeProducts = async ({
    search,
    page = 1,
    pageSize = 10,
    categoryId,
    status
}) => {
    if (!search) return [];
    const units = await ProductUnit.find(
        { barcode: search },
        'productId',
        options()
    )
        .lean()
        .exec();
    const filter = await productFilter({
        categoryId,
        status: status || 'Selling'
    });
    filter.id = { $in: units.map((row) => row.productId) };
    const products = clean(
        await Product.find(filter, null, options())
            .sort({ id: 1 })
            .skip((page - 1) * pageSize)
            .limit(Number(pageSize))
            .lean()
            .exec()
    );
    return posRows(products, search);
};
exports.checkBarcodeExists = async (barcode, excludeProductId = null) =>
    barcode
        ? Boolean(
              await ProductUnit.exists({
                  barcode,
                  ...(excludeProductId
                      ? { productId: { $ne: Number(excludeProductId) } }
                      : {})
              }).session(options().session || null)
          )
        : false;
