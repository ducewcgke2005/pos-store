const { runInTransaction } = require('../infrastructure/transaction');
const returnItemRepository = require("../repositories/returnItem.repository")
const inventoryService = require("./InventoryServices/inventory.service")

const getReturnItems = async (filters = {}) => {

    const page = Number(filters.page || 1);
    const pageSize = Number(filters.pageSize || 20);
    const offset = (page - 1) * pageSize;

    const data = await returnItemRepository.getReturnItems(null, {
        status: filters.status,
        pageSize,
        offset
    });

    return {
        page,
        pageSize,
        total: data.total,
        data: data.rows
    };

};

const approveRestock = async (returnItemId, staffId) => {

  return runInTransaction(async (transaction) => {

    const item = await returnItemRepository.getReturnItemById(transaction, returnItemId);

    if (!item) {
      throw new Error("Return item not found");
    }

    if (item.restockApproved !== "Pending") {
      throw new Error("Item already processed");
    }

    await returnItemRepository.updateRestockStatus(
      transaction,
      returnItemId,
      staffId,
      "Approved"
    );

    await inventoryService.addStock(
      transaction,
      item.productId,
      item.baseQuantity
    );

    return { success: true };

  });
};

const rejectRestock = async (returnItemId, staffId) => {

    return runInTransaction(async (transaction) => {

        const item = await returnItemRepository.getReturnItemById(transaction, returnItemId);

        if (!item) {
            throw new Error("Return item not found");
        }

        if (item.restockApproved !== "Pending") {
            throw new Error("Item already processed");
        }

        await returnItemRepository.updateRestockStatus(
            transaction,
            returnItemId,
            staffId,
            "Rejected"
        );

        return { success: true };

    });
};

module.exports = {
    getReturnItems,
    approveRestock,
    rejectRestock,
}