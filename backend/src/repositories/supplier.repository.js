const {
    Supplier,
    Product,
    ProductUnit,
    ProductSupplier,
    SupplierProductPrice,
    Staff
} = require('../models');
const { options, clean, insert, regex, pick } = require('./helpers');
exports.getList = async ({ search } = {}) =>
    clean(
        await Supplier.find(
            search ? { name: regex(search) } : {},
            'id name contactInfo address -_id',
            options()
        )
            .sort({ name: 1, id: 1 })
            .lean()
            .exec()
    );
exports.getById = async (id) =>
    clean(
        await Supplier.findOne(
            { id },
            'id name contactInfo address -_id',
            options()
        )
            .lean()
            .exec()
    );
exports.getProductsBySupplier = async (supplierId) => {
    const links = await ProductSupplier.find({ supplierId }, null, options())
        .lean()
        .exec();
    const result = [];
    for (const link of links) {
        const product = await Product.findOne(
            { id: link.productId },
            null,
            options()
        )
            .lean()
            .exec();
        if (!product) continue;
        const price = clean(
            await SupplierProductPrice.findOne(
                { supplierId, productId: link.productId },
                null,
                options()
            )
                .sort({ createdAt: -1, id: -1 })
                .lean()
                .exec()
        );
        const unit = await ProductUnit.findOne(
            { id: price?.unitId },
            null,
            options()
        )
            .lean()
            .exec();
        result.push({
            ...pick(product, 'id name code imageUrl baseUnit'),
            supplyPrice: price?.price ?? null,
            status: link.status,
            unitName: unit?.unitName || null
        });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
};
exports.getProductsNotInSupplier = async (supplierId, search) => {
    const links = await ProductSupplier.find(
        { supplierId },
        'productId',
        options()
    )
        .lean()
        .exec();
    return clean(
        await Product.find(
            {
                id: { $nin: links.map((row) => row.productId) },
                ...(search
                    ? {
                          $or: [
                              { name: regex(search) },
                              { code: regex(search) }
                          ]
                      }
                    : {})
            },
            'id name code -_id',
            options()
        )
            .sort({ name: 1, id: 1 })
            .lean()
            .exec()
    );
};
exports.getUnitsByProductId = async (productId) =>
    clean(
        await ProductUnit.find({ productId }, null, options())
            .sort({ id: 1 })
            .lean()
            .exec()
    );
exports.addProductToSupplier = async (
    supplierId,
    productId,
    price,
    unitId,
    createdBy
) => {
    await insert(ProductSupplier, { supplierId, productId, status: 'ACTIVE' });
    await insert(SupplierProductPrice, {
        supplierId,
        productId,
        price,
        unitId,
        createdBy
    });
};
exports.createSupplier = async (data) =>
    insert(Supplier, pick(data, 'name contactInfo address'));
exports.updateProductOfSupplier = async (
    supplierId,
    productId,
    price,
    unitId,
    createdBy
) =>
    insert(SupplierProductPrice, {
        supplierId,
        productId,
        price,
        unitId,
        createdBy
    });
exports.updateProductOfSupplierPrice = exports.updateProductOfSupplier;
exports.updateProductSupplierStatus = async (supplierId, productId, status) =>
    ProductSupplier.updateOne(
        { supplierId, productId },
        { $set: { status } },
        options()
    ).exec();
exports.updateSupplier = async (id, name, contactInfo, address) =>
    clean(
        await Supplier.findOneAndUpdate(
            { id },
            { $set: { name, contactInfo, address } },
            { ...options(), new: true }
        )
            .lean()
            .exec()
    );
exports.getPriceHistoryDetail = async (supplierId, productId) => {
    const rows = clean(
        await SupplierProductPrice.find(
            { supplierId, productId },
            null,
            options()
        )
            .sort({ createdAt: -1, id: -1 })
            .lean()
            .exec()
    );
    const result = [];
    for (const row of rows) {
        const unit = await ProductUnit.findOne(
            { id: row.unitId },
            null,
            options()
        )
            .lean()
            .exec();
        const employee = await Staff.findOne(
            { userId: row.createdBy },
            null,
            options()
        )
            .lean()
            .exec();
        if (unit)
            result.push({
                id: row.id,
                price: row.price,
                unitName: unit.unitName,
                createdAt: row.createdAt,
                updatedBy: employee?.fullName || null
            });
    }
    return result;
};
