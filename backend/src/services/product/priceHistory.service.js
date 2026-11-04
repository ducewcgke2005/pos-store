const priceHistoryRepository = require('../../repositories/product/priceHistory.repository');

exports.recordInitialPrice = async (productId, data) => {
    if (data.salePrice == null || data.productUnitId == null) return;

    await priceHistoryRepository.insertSaleHistory({
        productId,
        productUnitId: data.productUnitId,
        oldSalePrice: null,
        newSalePrice: data.salePrice,
        changedBy: data.createdBy || null
    });
};

exports.recordPriceChange = async (productId, data) => {
    if (data.newSalePrice == null || data.productUnitId == null) return;

    await priceHistoryRepository.insertSaleHistory({
        productId,
        productUnitId: data.productUnitId,
        oldSalePrice: data.oldSalePrice ?? null,
        newSalePrice: data.newSalePrice,
        changedBy: data.updatedBy
    });
};

exports.getLatestByProductId = async (productId) => {
    const [latestSalePriceHistory] = await Promise.all([
        priceHistoryRepository.getLatestSaleByProductId(productId)
    ]);

    return {
        latestSalePriceHistory
    };
};

exports.getAllByProductId = async (productId) => {
    const [salePriceHistories] = await Promise.all([
        priceHistoryRepository.getAllSaleByProductId(productId),
    ]);

    return {
        salePriceHistories
    };
};