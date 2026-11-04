const Category = require("../../repositories/categoryStock.repository");
const productRepository = require("../../repositories/productStock.repository");

const getCategoryStock = async (search, page, limit) => {
    const offset = (page - 1) * limit;

    const categories = await Category.getCategoryStock(
        search,
        limit,
        offset
    );

    const totalCategories = await Category.countCategories(search);

    return {
        pagination: {
            page,
            limit,
            totalCategories,
            totalPages: Math.ceil(totalCategories / limit)
        },
        categories
    };
};

const getProductStockByCategory = async (
    categoryId,
    search,
    page,
    limit
) => {
    const offset = (page - 1) * limit;

    const products = await productRepository.getProductsByCategory(
        categoryId,
        search,
        limit,
        offset
    );

    const total = await productRepository.countProductsByCategory(
        categoryId,
        search
    );

    return {
        products,
        total
    };
};

const getProductsBySupplier = async (
    supplierId,
    search
) => {

    const products = await productRepository.getProductsBySupplier(
        supplierId,
        search
    );

    return {
        products,
        total: products.length
    };
};

const updateProductStock = async (productId, quantity) => {
    return await productRepository.updateStock(productId, quantity);
};

// Thêm hàm mới để controller dùng
const getProductBasicInfo = async (productId) => {
    return await productRepository.getProductBasicInfo(productId);
};

const addStock = async (transaction, productId, quantity) => {
    return await productRepository.addStock(transaction, productId, quantity);
};


const deductStock = async (transaction, items) => {
    const updatedStocks = [];

    for (const item of items) {
        if (!item.productId) {
            throw new Error("Invalid productId");
        }
        if (item.baseQuantity == null) {
            throw new Error(`baseQuantity missing for product ${item.productId}`);
        }
        const deductQty = Number(item.baseQuantity);

        if (deductQty <= 0) {
            throw new Error(`Invalid deduct quantity for product ${item.productId}`);
        }

        const stock = await productRepository.getStockByProductId(
            transaction,
            item.productId
        );

        if (!stock) {
            throw new Error(`Stock not found for product ${item.productId}`);
        }

        const currentStock = Number(stock.quantityOnHand || 0);

        if (currentStock < deductQty) {
            throw new Error(`Insufficient stock for product ${item.productId}`);
        }

        const updatedStock = await productRepository.decreaseStockIfAvailable(
            transaction,
            item.productId,
            deductQty
        );
        if (!updatedStock) {
            throw new Error(`Insufficient stock for product ${item.productId}`);
        }

        updatedStocks.push({
            productId: item.productId,
            oldStock: currentStock,
            deductedQuantity: deductQty,
            stock: updatedStock.quantityOnHand
        });
    }

    return updatedStocks;
};

const updateMinThreshold = async (productId, minThreshold) => {
    if (!productId) {
        throw new Error("ProductId is required");
    }

    if (minThreshold == null || minThreshold < 0) {
        throw new Error("Min threshold must be >= 0");
    }

    const updatedStock = await productRepository.updateMinThreshold(
        productId,
        minThreshold
    );

    if (!updatedStock) {
        throw new Error("Inventory stock not found");
    }

    return updatedStock;
};

const searchProducts = async (keyword) => {
  if (!keyword || keyword.trim().length < 2) {
    return [];
  }

  const products = await productRepository.searchProducts(keyword.trim());

  return products;
};

const getLowStockProducts = async (currentUser) => {

    if (!currentUser.permissions.includes("CREATE_PURCHASE_ORDER")) {
        throw new Error("PERMISSION_DENIED");
    }

    return await productRepository.getLowStockProductUnits();

};

const searchProductUnits = async (keyword) => {

    if (!keyword) {
        return [];
    }

    return await productRepository.searchProductUnits(keyword);
};


module.exports = {
    deductStock,
    getCategoryStock,
    getProductStockByCategory,
    getProductsBySupplier,
    updateProductStock,
    getProductBasicInfo,
    updateMinThreshold,
    searchProducts,
    getLowStockProducts,
    searchProductUnits,
    addStock,
}
