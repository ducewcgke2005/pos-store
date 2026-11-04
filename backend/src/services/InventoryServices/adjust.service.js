const { transactional } = require('../../infrastructure/transaction');
const inventoryAdjustmentRepository = require("../../repositories/adjust.repository");
const staffRepository = require("../../repositories/staff.repository");

const createAdjustment = async (user, body) => {
    if (!user.permissions.includes("CREATE_ADJUST")) {
        throw new Error("Bạn không có quyền tạo phiếu");
    }

    const staff = await staffRepository.getStaffByUserId(user.id);
    if (!staff) {
        throw new Error("Không tìm thấy nhân viên");
    }

    const { reason, items } = body;
    if (!reason || !items || items.length === 0) {
        throw new Error("Dữ liệu không hợp lệ");
    }

    // Validation mới cho format kiểm kê theo unit lớn nhất
    for (let item of items) {
        if (!item.productId || typeof item.actualLargest !== "number" || typeof item.actualRemainder !== "number") {
            throw new Error("Dữ liệu item không hợp lệ (cần productId, actualLargest, actualRemainder)");
        }
    }

    const adjustmentId = await inventoryAdjustmentRepository.createAdjustmentWithItems(
        staff.id,
        reason,
        items
    );

    return { adjustmentId };
};

const updateStatus = async (user, adjustmentId, newStatus) => {
    // giữ nguyên
    if (!user.permissions.includes("PROCESS_ADJUST")) {
        throw new Error("Bạn không có quyền xử lý phiếu");
    }

    if (!["Approved", "Rejected"].includes(newStatus)) {
        throw new Error("Trạng thái không hợp lệ");
    }

    const staff = await staffRepository.getStaffByUserId(user.id);
    if (!staff) {
        throw new Error("Không tìm thấy nhân viên");
    }

    return await inventoryAdjustmentRepository.updateStatusTransaction(
        adjustmentId,
        staff.id,
        newStatus
    );
};

const getAdjustments = async (filters) => {
    return await inventoryAdjustmentRepository.getAdjustments(filters);
};

const getAdjustmentDetail = async (adjustmentId) => {
    const data = await inventoryAdjustmentRepository.getAdjustmentDetail(adjustmentId);
    if (!data) {
        throw new Error("Phiếu không tồn tại");
    }
    return data;
};

const checkProductInPending = async (productId) => {
    return await inventoryAdjustmentRepository.checkProductInPending(productId);
};

module.exports = {
    createAdjustment,
    updateStatus,
    getAdjustments,
    getAdjustmentDetail,
    checkProductInPending
};
// This service defines the unit of work; repositories share its session.
for (const method of ["createAdjustment","updateStatus"]) {
    if (typeof module.exports[method] !== 'function') throw new Error('Unknown transaction method: ' + method);
    module.exports[method] = transactional(module.exports[method]);
}
