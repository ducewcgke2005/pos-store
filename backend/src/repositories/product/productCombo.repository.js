const {
    ProductCombo,
    Product,
    ProductUnit,
    InventoryStock
} = require('../../models');
const { options, clean, insert, pick } = require('../helpers');
exports.getComboItems = async (parentProductId) => {
    const rows = clean(
        await ProductCombo.find({ parentProductId }, null, options())
            .sort({ id: 1 })
            .lean()
            .exec()
    );
    const result = [];
    for (const row of rows) {
        const product = await Product.findOne(
            { id: row.childProductId },
            null,
            options()
        )
            .lean()
            .exec();
        const unit = clean(
            await ProductUnit.findOne(
                { productId: row.childProductId, conversionFactor: 1 },
                null,
                options()
            )
                .lean()
                .exec()
        );
        if (product)
            result.push({
                ...row,
                childProductName: product.name,
                childProductCode: product.code,
                baseUnit: product.baseUnit,
                childSalePrice: unit?.salePrice || 0
            });
    }
    return result;
};
exports.getComboCostPrice = async (productId) =>
    (await exports.getComboItems(productId)).reduce(
        (sum, row) => sum + row.quantity * row.childSalePrice,
        0
    );
exports.addComboItem = async (
    parentProductId,
    { childProductId, quantity = 1 }
) => insert(ProductCombo, { parentProductId, childProductId, quantity });
exports.removeComboItem = async (id, parentProductId) =>
    Boolean(
        (
            await ProductCombo.deleteOne(
                { id, parentProductId },
                options()
            ).exec()
        ).deletedCount
    );
