const { runInTransaction, afterCommit } = require('../infrastructure/transaction');
const invoiceRepository = require("../repositories/invoice.repository");
const returnRepository = require("../repositories/return.repository");
const returnItemRepository = require("../repositories/returnItem.repository");
const invoiceService = require("./invoice.service")
const customerPointLogService = require("./customerPointLog.service");

const ROLE_MANAGER = 1;



exports.getReturns = async (filters = {}, user) => {
    const page = Math.max(1, Number(filters.page || 1));
    const pageSize = Math.max(1, Number(filters.pageSize || 20));
    const offset = (page - 1) * pageSize;

    const data = await returnRepository.getReturns(null, {
        status: filters.status,
        pageSize,
        offset,
        staffId: user.roleId === ROLE_MANAGER ? null : (user.staffId || user.id)
    });

    return {
        page,
        pageSize,
        total: data.total,
        data: data.rows
    };
};

exports.getReturnDetail = async (returnId) => {
    const data = await returnRepository.getReturnDetail(returnId);
    if (!data) throw new Error("Return not found");
    return data;
};

exports.createReturn = async (user, payload = {}) => {
    const { invoiceId, reason, items = [] } = payload;

    if (!items.length) throw new Error("Return items required");

    return await runInTransaction(async (transaction) => {
        // 1. Lock invoice
        const invoice = await invoiceRepository.getInvoice(
            transaction,
            invoiceId,
            { forUpdate: true }
        );
        if (!invoice) throw new Error("Invoice not found");
        if (invoice.status !== "PAID") throw new Error("Invoice must be PAID");
        
        // 2. Lấy item gốc
        const invoiceItems = await invoiceRepository.getInvoiceItems(transaction, invoiceId);
        const itemMap = new Map(invoiceItems.map(i => [Number(i.id), i]));

        // 3. Lấy tất cả return trước đó
        const returnRaw = await returnRepository.getReturnsByInvoiceId(invoiceId);

        // 4. Gom số lượng đã return (PENDING + APPROVED)
        const returnedMap = new Map();

        returnRaw.forEach(r => {
            const status = r.status?.toUpperCase();
            console.log(r)
            if (!["PENDING", "APPROVE", "HOLDING"].includes(status)) return;

            const key = Number(r.invoiceItemId);
            const prev = returnedMap.get(key) || 0;
            returnedMap.set(key, prev + Number(r.quantity));
        });

        // 5. Check full invoice
        const isFullyReturned = invoiceItems.every(item => {
            const returnedQty = returnedMap.get(Number(item.id)) || 0;
            return returnedQty >= item.quantity;
        });

        if (isFullyReturned) {
            throw new Error("Đơn hàng đã hoàn trả tất cả sản phẩm.");
        }

        const totalAmountRaw = invoiceItems.reduce(
            (sum, i) => sum + (i.unitPrice * i.quantity),
            0
        );

        const totalDiscount = totalAmountRaw - invoice.finalAmount;

        const discountRatio =
            totalAmountRaw > 0 ? totalDiscount / totalAmountRaw : 0;

        // 6. Validate từng item
        let totalRefund = 0;
        const round = (n) => Math.round(n * 1000) / 1000;

        const requested = new Set();
        const returnItemsData = items.map(item => {
            if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) throw new Error('Invalid return quantity');
            if (requested.has(Number(item.invoiceItemId))) throw new Error('Duplicate invoiceItemId');
            requested.add(Number(item.invoiceItemId));
            const invItem = itemMap.get(Number(item.invoiceItemId));

            if (!invItem) {
                throw new Error(`Invalid invoiceItemId: ${item.invoiceItemId}`);
            }

            const alreadyReturned = returnedMap.get(Number(item.invoiceItemId)) || 0;
            const remainingQty = invItem.quantity - alreadyReturned;

            if (remainingQty <= 0) {
                throw new Error(`Sản phẩm ${invItem.productName} đã hoàn trả đủ.`);
            }

            if (item.quantity > remainingQty) {
                throw new Error(
                    `Return exceeds remaining for ${invItem.productName}. Remaining: ${remainingQty}`
                );
            }

            // 🔥 FIX CHÍNH
            const discountedUnitPrice = round(
                invItem.unitPrice * (1 - discountRatio)
            );

            const refundAmount = round(
                item.quantity * discountedUnitPrice
            );

            totalRefund = round(totalRefund + refundAmount);

            const ratio = invItem.quantity > 0
                ? (invItem.baseQuantity / invItem.quantity)
                : 0;

            return {
                invoiceItemId: item.invoiceItemId,
                productId: invItem.productId,
                productUnitId: invItem.productUnitId,
                productName: invItem.productName,
                unitName: invItem.unitName,
                quantity: item.quantity,
                baseQuantity: item.quantity * ratio,
                refundAmount
            };
        });

        // 7. Tạo return
        const returnId = await returnRepository.createReturn(transaction, {
            invoiceId,
            counterId: user.counterId,
            staffId: user.staffId || user.id,
            returnType: "REFUND",
            refundMethod: "CASH",
            totalRefundAmount: totalRefund,
            status: "Holding",
            reason
        });

        // 8. Insert return items
        for (const item of returnItemsData) {
            await returnItemRepository.createReturnItem(transaction, returnId, item);
        }

        return { returnId, totalRefund };
    });
};


exports.approveReturn = async (user, returnId) => {
    return await runInTransaction(async (transaction) => {

        // 1. Lấy return + lock
        const ret = await returnRepository.getReturnById(transaction, returnId);
        if (!ret || ret.status !== "Pending") {
            throw new Error("Only PENDING return can be approved");
        }

        // 2. Lock invoice
        const invoice = await invoiceRepository.getInvoice(
            transaction,
            ret.invoiceId,
            { forUpdate: true }
        );

        if (!invoice) throw new Error("Invoice not found");

        // 3. Lấy item invoice
        const invoiceItems = await invoiceRepository.getInvoiceItems(transaction, ret.invoiceId);

        // 4. Lấy item của return hiện tại
        const returnItems = await returnItemRepository.getItemsByReturnId(
            transaction,
            returnId
        );

        // 5. Lấy tất cả return trước đó để tính full return
        const allReturns = await returnRepository.getReturnsByInvoiceId(ret.invoiceId);

        const returnedMap = new Map();
        allReturns.forEach(r => {
            const status = r.status?.toUpperCase();
            if (!["APPROVE", "APPROVED"].includes(status)) return;

            const key = Number(r.invoiceItemId);
            const prev = returnedMap.get(key) || 0;
            returnedMap.set(key, prev + Number(r.quantity));
        });

        // 6. Tính discount ratio
        const totalAmountRaw = invoiceItems.reduce(
            (sum, i) => sum + i.unitPrice * i.quantity,
            0
        );

        const totalDiscount = totalAmountRaw - invoice.finalAmount;

        const discountRatio =
            totalAmountRaw > 0 ? totalDiscount / totalAmountRaw : 0;

        let totalRefund = 0;

        // 7. Tính refund từng item
        for (const rItem of returnItems) {
            const invItem = invoiceItems.find(i => i.id === rItem.invoiceItemId);
            if (!invItem) continue;

            const discountedUnitPrice =
                invItem.unitPrice * (1 - discountRatio);

            const refundAmount = Math.round(
                rItem.quantity * discountedUnitPrice
            );

            totalRefund += refundAmount;

            await returnItemRepository.updateItemRefundAmount(
                transaction,
                rItem.id,
                refundAmount
            );
        }

        // 8. Không cho refund vượt số tiền đã thanh toán
        if (totalRefund > invoice.finalAmount) {
            totalRefund = invoice.finalAmount;
        }

        // 9. Detect full return (sau khi approve cái này)
        const futureReturnedMap = new Map(returnedMap);

        returnItems.forEach(i => {
            const prev = futureReturnedMap.get(i.invoiceItemId) || 0;
            futureReturnedMap.set(i.invoiceItemId, prev + i.quantity);
        });

        const isFullReturn = invoiceItems.every(item => {
            const returnedQty = futureReturnedMap.get(item.id) || 0;
            return returnedQty >= item.quantity;
        });

        // 10. Update return
        await returnRepository.updateReturnStatus(transaction, returnId, {
            status: "Approve",
            approveBy: user.staffId || user.id,
            approvedAt: new Date(),
            totalRefundAmount: totalRefund
        });

        if (invoice.customerId) {
            const refundRatio = invoice.finalAmount > 0 ? totalRefund / invoice.finalAmount : 0;

            // --- 1. HOÀN LẠI ĐIỂM KHÁCH ĐÃ DÙNG (Cộng lại điểm) ---
            // Chỉ chạy nếu đơn hàng này khách có dùng điểm để thanh toán (usedPoints > 0)
            if (invoice.usedPoints > 0) {
                const pointsToReturn = isFullReturn
                    ? invoice.usedPoints
                    : Math.round(invoice.usedPoints * refundRatio);

                if (pointsToReturn > 0) {
                    await customerPointLogService.adjustPoints(
                        transaction,
                        invoice.customerId,
                        invoice.id,
                        pointsToReturn,
                        isFullReturn ? "REFUND_USED_POINTS" : "PARTIAL_REFUND_POINTS"
                    );
                }
            }

            const pointsToRevoke = Math.floor(totalRefund / 10000);

            if (pointsToRevoke > 0) {
                await customerPointLogService.adjustPoints(
                    transaction,
                    invoice.customerId,
                    invoice.id,
                    -pointsToRevoke, // Số âm: trừ đi số điểm đã tặng "oan"
                    isFullReturn ? "REVOKE_EARNED_POINTS" : "PARTIAL_REVOKE_POINTS"
                );
            }
        }

        // 11. Đánh dấu chuyển kho
        await returnItemRepository.updateRestockApprovedByReturnId(
            transaction,
            returnId,
            "Pending"
        );

        return {
            success: true,
            data: {
                returnId: Number(returnId),
                totalRefund,
                isFullReturn
            }
        };
    });
};

exports.rejectReturn = async (user, returnId, data) => {
    const note = data?.note || null;

    return await runInTransaction(async (transaction) => {
        const ret = await returnRepository.getReturnById(transaction, returnId);
        
        if (!ret) {
            throw new Error("Không tìm thấy đơn hoàn trả.");
        }

        if (ret.status !== "Pending") {
            throw new Error("Chỉ có thể từ chối đơn hàng đang ở trạng thái 'Chờ duyệt'.");
        }

        await returnRepository.updateReturnStatus(transaction, returnId, {
            status: "Reject",
            approveBy: user.staffId || user.id,
            approvedAt: new Date(),
            note: note 
        });

        await returnItemRepository.updateRestockApprovedByReturnId(transaction, returnId, "Cancel");

        return { 
            returnId: Number(returnId), 
            status: "Reject",
            note: note
        };
    });
};
