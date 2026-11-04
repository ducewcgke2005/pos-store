const { transactional } = require('../../infrastructure/transaction');
const supplierRepository = require("../../repositories/supplier.repository");

const getSupplierList = async (query) => {

    const {
        search
    } = query;

    const suppliers = await supplierRepository.getList({
        search
    });

    return suppliers;
};

const getSupplierById = async (id) => {

    if (!id) {
        throw new Error("SUPPLIER_ID_REQUIRED");
    }

    const supplier = await supplierRepository.getById(id);

    if (!supplier) {
        throw new Error("SUPPLIER_NOT_FOUND");
    }

    return supplier;
};

const getProductsBySupplier = async (supplierId) => {
    if (!supplierId) {
        throw new Error("SUPPLIER_ID_REQUIRED");
    }

    return await supplierRepository.getProductsBySupplier(supplierId);
};

const getProductsNotInSupplier = async (supplierId, query) => {
    if (!supplierId) {
        throw new Error("SUPPLIER_ID_REQUIRED");
    }

    const { search } = query;

    return await supplierRepository.getProductsNotInSupplier(
        supplierId,
        search
    );
};

const getUnitsByProductId = async (productId) => {

    if (!productId) {
        throw new Error("ProductId is required");
    }

    const units = await supplierRepository.getUnitsByProductId(productId);

    return units;
};

const addProductToSupplier = async (supplierId, body, userId) => {

    if (!supplierId) {
        throw new Error("SUPPLIER_ID_REQUIRED");
    }

    const { productId, price, productUnitId } = body;

    if (!productId || !price || !productUnitId) {
        throw new Error("PRODUCT_UNIT_PRICE_REQUIRED");
    }

    await supplierRepository.addProductToSupplier(
        supplierId,
        productId,
        price,
        productUnitId,
        userId
    );
};

const createSupplier = async (body) => {

    const { name, contactInfo, address } = body;

    if (!name || name.trim() === "") {
        throw new Error("SUPPLIER_NAME_REQUIRED");
    }

    return await supplierRepository.createSupplier({
        name: name.trim(),
        contactInfo,
        address
    });
};

const updateProductOfSupplier = async (
    supplierId,
    productId,
    body,
    userId
) => {

    const { price, productUnitId, status } = body;

    // update status
    if (status) {
        await supplierRepository.updateProductSupplierStatus(
            supplierId,
            productId,
            status
        );
    }

    // chỉ insert khi có price
    if (price && productUnitId) {
        await supplierRepository.updateProductOfSupplierPrice(
            supplierId,
            productId,
            price,
            productUnitId,
            userId
        );
    }
};

const updateSupplier = async (id, body) => {

    if (!id) {
        throw new Error("SUPPLIER_ID_REQUIRED");
    }

    const { name, contactInfo, address } = body;

    if (!name || name.trim() === "") {
        throw new Error("SUPPLIER_NAME_REQUIRED");
    }

    const supplier = await supplierRepository.getById(id);

    if (!supplier) {
        throw new Error("SUPPLIER_NOT_FOUND");
    }

    return await supplierRepository.updateSupplier(
        id,
        name.trim(),
        contactInfo,
        address
    );
};

const getPriceHistoryDetail = async (supplierId, productId) => {

    return await supplierRepository.getPriceHistoryDetail(
        supplierId,
        productId
    );

};

module.exports = {
    getSupplierList,
    getSupplierById,
    getProductsBySupplier,
    getProductsNotInSupplier,
    addProductToSupplier,
    createSupplier,
    updateProductOfSupplier,
    updateSupplier,
    getUnitsByProductId,
    getPriceHistoryDetail
}
// This service defines the unit of work; repositories share its session.
for (const method of ["addProductToSupplier","updateProductOfSupplier"]) {
    if (typeof module.exports[method] !== 'function') throw new Error('Unknown transaction method: ' + method);
    module.exports[method] = transactional(module.exports[method]);
}
