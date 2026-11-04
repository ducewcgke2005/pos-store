const {
    ProductUnit,
    Product,
    PriceHistory,
    InvoiceItem,
    PurchaseOrderItem,
    PromotionProduct,
    ReturnItem,
    SupplierProductPrice
} = require('../../models');
const { options, clean, insert, regex, pick } = require('../helpers');
const withProduct = async (unit) => {
    if (!unit) return null;
    const product = await Product.findOne(
        { id: unit.productId },
        null,
        options()
    )
        .lean()
        .exec();
    return product ? { ...unit, productName: product.name } : null;
};
exports.getList = async ({ search = '' } = {}) => {
    const products = await Product.find(
        { $or: [{ name: regex(search) }, { code: regex(search) }] },
        'id',
        options()
    )
        .lean()
        .exec();
    const units = clean(
        await ProductUnit.find(
            {
                $or: [
                    { productId: { $in: products.map((row) => row.id) } },
                    { barcode: regex(search) },
                    { unitName: regex(search) }
                ]
            },
            null,
            options()
        )
            .sort({ conversionFactor: 1, id: 1 })
            .lean()
            .exec()
    );
    const rows = [];
    for (const unit of units) {
        const row = await withProduct(unit);
        if (row) rows.push(row);
    }
    return rows.sort(
        (a, b) =>
            a.productName.localeCompare(b.productName) ||
            a.conversionFactor - b.conversionFactor ||
            a.id - b.id
    );
};
exports.getById = async (id) =>
    withProduct(
        clean(await ProductUnit.findOne({ id }, null, options()).lean().exec())
    );
exports.getByBarcode = async (barcode) => {
    const unit = clean(
        await ProductUnit.findOne({ barcode }, null, options()).lean().exec()
    );
    if (!unit) return null;
    const product = await Product.findOne(
        { id: unit.productId },
        null,
        options()
    )
        .lean()
        .exec();
    return product
        ? {
              ...unit,
              productUnitId: unit.id,
              name: product.name,
              allowDecimalQuantity: product.allowDecimalQuantity,
              isCombo: product.isCombo
          }
        : null;
};
exports.getByProduct = async (productId) =>
    clean(
        await ProductUnit.find({ productId }, null, options())
            .sort({ conversionFactor: 1, id: 1 })
            .lean()
            .exec()
    );
exports.create = async (data) => {
    const unit = await insert(
        ProductUnit,
        pick(
            data,
            'productId unitName unitType conversionFactor salePrice barcode'
        )
    );
    await insert(PriceHistory, {
        productId: unit.productId,
        productUnitId: unit.id,
        oldSalePrice: null,
        newSalePrice: unit.salePrice,
        changedBy: data.createdBy || null
    });
    return unit.id;
};
exports.update = async (id, data) => {
    const current = await exports.getById(id);
    if (!current) return false;
    await ProductUnit.updateOne(
        { id },
        {
            $set: pick(
                data,
                'unitName unitType conversionFactor salePrice barcode'
            )
        },
        options()
    ).exec();
    if (Number(data.salePrice) !== current.salePrice)
        await insert(PriceHistory, {
            productId: current.productId,
            productUnitId: current.id,
            oldSalePrice: current.salePrice,
            newSalePrice: data.salePrice,
            changedBy: data.updatedBy || null
        });
    return true;
};
exports.remove = async (id) => {
    // SQL FK restrictions also cover price history. References use public IDs.
    for (const [Model, field] of [
        [InvoiceItem, 'productUnitId'],
        [PurchaseOrderItem, 'productUnitId'],
        [PromotionProduct, 'productUnitId'],
        [ReturnItem, 'productUnitId'],
        [SupplierProductPrice, 'unitId'],
        [PriceHistory, 'productUnitId']
    ]) {
        if (
            await Model.exists({ [field]: id }).session(
                options().session || null
            )
        ) {
            const error = new Error('Dữ liệu liên kết không hợp lệ.');
            error.number = 547;
            throw error;
        }
    }
    return Boolean(
        (await ProductUnit.deleteOne({ id }, options()).exec()).deletedCount
    );
};
