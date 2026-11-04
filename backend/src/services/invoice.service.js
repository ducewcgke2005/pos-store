const { runInTransaction, afterCommit } = require('../infrastructure/transaction');
const crypto = require("crypto")
const invoiceRepository = require("../repositories/invoice.repository");
const promotionRepository = require("../repositories/promotion.repository");
const paymentRepository = require("../repositories/payment.repository")
const returnRepository = require("../repositories/return.repository")


const generateInvoiceCode = (invoiceId) => {
    const now = new Date();
    const date =
        now.getFullYear().toString() +
        String(now.getMonth() + 1).padStart(2, "0") +
        String(now.getDate()).padStart(2, "0");

    return `INV${date}-${String(invoiceId).padStart(6, "0")}`;
};

const validateItems = (items) => {

    if (!Array.isArray(items))
        throw new Error("Items must be array");

    for (const item of items) {
        if (!item?.productId || !item.productUnitId || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) {
            throw new Error("Invalid item format");
        }
    }
};

const getAllInvoice = async ({ page, pageSize, status, invoiceCode } = {}) => {
    return invoiceRepository.getInvoiceList({
        page,
        pageSize,
        status,
        invoiceCode
    });
};

const createInvoice = async ({ items, staffId, counterId, customerId }) => {
    if (!staffId) throw new Error("Invalid staff");

    validateItems(items);

    return runInTransaction(async (transaction) => {

        let invoiceCode = `INV-${crypto.randomUUID()}`;
        const invoiceId = await invoiceRepository.insertInvoice(transaction, {
            staffId,
            invoiceCode,
            counterId,
            customerId,
        });

        invoiceCode = generateInvoiceCode(invoiceId);
        await invoiceRepository.updateInvoiceCode(transaction, invoiceId, invoiceCode);

        let totalAmount = 0;
        let totalDiscount = 0;


        for (const item of items) {
            const product = await invoiceRepository.getProductById(transaction, item.productId, item.productUnitId);
            if (!product) throw new Error(`Product ${item.productId} not found`);

            const discountData = await promotionRepository.getDiscountByProduct({
                productId: item.productId,
                productUnitId: item.productUnitId
            });

            let unitPrice = product.salePrice;
            let itemDiscount = 0;

            if (discountData && discountData.promotionId) {
                if (discountData.discountPercent > 0) {
                    itemDiscount = Math.round((unitPrice * discountData.discountPercent / 100) * 1000) / 1000;
                } else if (discountData.discountAmount > 0) {
                    itemDiscount = discountData.discountAmount;
                }
                unitPrice = Math.max(0, Math.round((unitPrice - itemDiscount) * 1000) / 1000);
            }
            const lineTotal = Math.round((unitPrice * item.quantity) * 1000) / 1000;
            const baseQuantity = Math.round((item.quantity * product.conversionFactor) * 1000) / 1000;

            totalAmount = Math.round((totalAmount + lineTotal) * 1000) / 1000;
            totalDiscount = Math.round((totalDiscount + (itemDiscount * item.quantity)) * 1000) / 1000;

            await invoiceRepository.insertInvoiceItem(transaction, {
                invoiceId,
                productId: item.productId,
                productName: product.name,
                quantity: item.quantity,
                unitPrice,
                lineTotal,
                productUnitId: item.productUnitId,
                unitName: product.unitName,
                baseQuantity,
            });
        }

        await invoiceRepository.updateAmounts(transaction, invoiceId, {
            totalAmount,
            finalAmount: Math.round((totalAmount - totalDiscount) * 1000) / 1000,
        });

        if (totalDiscount > 0) {
            await invoiceRepository.updateInvoiceDiscount(transaction, invoiceId, null, totalDiscount);
        }

        return { id: invoiceId, invoiceCode };
    });
};

const updateInvoiceItems = async (id, { items }) => {

    return runInTransaction(async (transaction) => {

        await getEditableInvoice(transaction, id);
        validateItems(items);

        await invoiceRepository.deleteInvoiceItems(transaction, id);

        let totalAmount = 0;
        let totalDiscount = 0;
        for (const item of items) {
            const product = await invoiceRepository.getProductById(transaction, item.productId, item.productUnitId);
            if (!product) throw new Error(`Product ${item.productId} not found`);

            const unitPrice = item.unitPrice;
            const lineTotal = Math.round((unitPrice * item.quantity) * 1000) / 1000;
            const baseQuantity = Math.round((item.quantity * product.conversionFactor) * 1000) / 1000;

            totalAmount = Math.round((totalAmount + lineTotal) * 1000) / 1000;
            await invoiceRepository.insertInvoiceItem(transaction, {
                invoiceId: id,
                productId: item.productId,
                productName: product.name,
                quantity: item.quantity,
                unitPrice,
                lineTotal,
                productUnitId: item.productUnitId,
                unitName: product.unitName,
                baseQuantity,
            });

        }
        console.log(totalAmount)
        await invoiceRepository.updateAmounts(transaction, id, {
            totalAmount,
            finalAmount: Math.round((totalAmount - totalDiscount) * 1000) / 1000
        });

        if (totalDiscount > 0) {
            await invoiceRepository.updateInvoiceDiscount(transaction, id, null, totalDiscount);
        }

        return { updated: true };

    });

};

const getEditableInvoice = async (transaction, id) => {

    const invoice = await invoiceRepository.getInvoiceById(
        transaction,
        id,
        { forUpdate: true }
    );

    if (!invoice)
        throw new Error("Invoice not found");

    if (!["UNPAID", "PENDING"].includes(invoice.status))
        throw new Error("Cannot update this invoice");

    return invoice;
};

const cancelInvoice = async (id) => {

    return runInTransaction(async (transaction) => {

        await getEditableInvoice(transaction, id);

        await invoiceRepository.updateStatus(
            transaction,
            id,
            "CANCELLED"
        );

        const existingPayment = await invoiceRepository.getPaymentByInvoiceId(transaction, id);

        if (existingPayment) {
            await paymentRepository.updatePayment(transaction, {
                invoiceId: id,
                amount: existingPayment.amount,
                paymentMethod: existingPayment.paymentMethod,
                status: "CANCELLED",
            });
        }
        return { cancelled: true };

    });

};

const getDraftInvoices = async () => {
    return invoiceRepository.getDraftInvoices();
};

const getInvoiceDetail = async (id) => {
    // 1. Lấy invoice
    const data = await invoiceRepository.getInvoiceDetail(id);
    if (!data) throw new Error("Invoice not found");

    // 2. Lấy return
    const returnRaw = await returnRepository.getReturnsByInvoiceId(id);

    // 3. Group returns
    const returnMap = new Map();

    for (const row of returnRaw) {
        if (!returnMap.has(row.id)) {
            returnMap.set(row.id, {
                id: Number(row.id),
                returnType: row.returnType,
                refundMethod: row.refundMethod,
                totalRefundAmount: Number(row.totalRefundAmount) || 0,
                status: row.status?.toUpperCase(),
                createdAt: row.createdAt,
                items: []
            });
        }

        if (row.returnItemId) {
            returnMap.get(row.id).items.push({
                id: Number(row.returnItemId),
                invoiceItemId: Number(row.invoiceItemId),
                productId: Number(row.productId),
                productName: row.productName,
                quantity: Number(row.quantity) || 0,
                refundAmount: Number(row.refundAmount) || 0,
                unitName: row.unitName,
                productUnitId: Number(row.productUnitId),
                baseQuantity: Number(row.baseQuantity) || 0,
                restockApproved: row.restockApproved
            });
        }
    }

    const returns = Array.from(returnMap.values());

    // 4. Map số lượng đã hoàn
    const returnedMap = new Map();

    returns.forEach(r => {
        if (!["APPROVE", "APPROVED"].includes(r.status)) return;

        r.items.forEach(i => {
            const prev = returnedMap.get(i.invoiceItemId) || 0;
            returnedMap.set(i.invoiceItemId, prev + i.quantity);
        });
    });

    // 5. Tính discount ratio
    const totalAmountRaw = data.items.reduce(
        (sum, i) => sum + Number(i.lineTotal || 0),
        0
    );

    const finalAmount = Number(data.finalAmount) || 0;

    const totalDiscount = totalAmountRaw - finalAmount;

    const discountRatio =
        totalAmountRaw > 0 ? totalDiscount / totalAmountRaw : 0;

    // 6. Mapping item
    const items = data.items.map(item => {
        const factor = Number(item.factor) || 1;
        const quantity = Number(item.quantity) || 0;
        const lineTotal = Number(item.lineTotal) || 0;

        const returnedQty = returnedMap.get(item.id) || 0;

        const discountedLineTotal = lineTotal * (1 - discountRatio);

        const discountedUnitPrice =
            quantity > 0 ? discountedLineTotal / quantity : 0;

        return {
            id: Number(item.id),
            productId: Number(item.productId),
            productUnitId: Number(item.productUnitId),

            productName: item.productName,
            code: item.code,

            quantity,

            unitPrice: Number(item.unitPrice) || 0,
            discountedUnitPrice: Math.round(discountedUnitPrice),

            lineTotal,
            discountedLineTotal: Math.round(discountedLineTotal),

            unitName: item.unitName,
            factor,
            unitType: item.unitType,

            // tồn kho
            productStock: Number(item.quantityOnHand) || 0,
            quantityOnHand: (Number(item.quantityOnHand) || 0) / factor,

            // hoàn trả
            returnedQuantity: returnedQty,
            remainingQuantity: quantity - returnedQty
        };
    });

    // 7. Tổng tiền (chuẩn hóa lại)
    const totalAmount = items.reduce((sum, i) => sum + i.lineTotal, 0);

    const totalRefund = returns.reduce((sum, r) => {
        if (!["APPROVE", "APPROVED"].includes(r.status)) return sum;
        return sum + r.totalRefundAmount;
    }, 0);

    const safeRefund = Math.min(totalRefund, finalAmount);

    // 8. Final response
    return {
        id: Number(data.id),
        invoiceCode: data.invoiceCode,
        createdAt: data.createdAt,

        status: data.status,

        customerId: data.customerId ? Number(data.customerId) : null,
        customerName: data.customerName,
        customerPoints: data.loyaltyPoints,
        customerPhone: data.phone,

        staffName: data.staffName,
        counterName: data.counterName,

        totalAmount,
        finalAmount,

        totalDiscount,
        totalRefund: safeRefund,

        items,
        returns
    };
};

const updateInvoiceCustomer = async (
    id,
    { customerId } = {}
) => {
    return runInTransaction(async (transaction) => {

        const invoice = await invoiceRepository.getInvoiceById(
            transaction,
            id,
            { forUpdate: true }
        );

        if (!invoice) {
            throw new Error("Invoice not found");
        }

        if (["PAID", "CANCELLED"].includes(invoice.status)) {
            throw new Error("Cannot update this invoice");
        }


        if (customerId !== undefined) {

            if (customerId !== null) {
                const customer = await invoiceRepository.getCustomerById(
                    transaction,
                    customerId
                );

                if (!customer) {
                    throw new Error("Customer not found");
                }
            }
            await invoiceRepository.updateCustomer(
                transaction,
                id,
                customerId
            );
        }

    });
};

/* =====================================================
   TỰ ĐỘNG ĐỒNG BỘ CA LÀM THEO FILE CONFIG
===================================================== */
const syncCounter = async (userId, configCounterId) => {
    const data = await invoiceRepository.getStaffAndSchedule(userId);
    if (!data)
        throw new Error("Tài khoản chưa được liên kết với nhân viên!");
    const { staffId, roleName, schedule } = data;

    if (roleName === 'Manager') {
        return { staffId, counterId: configCounterId };
    }

    if (!schedule || schedule.status !== 'working') {
        const err = new 
        Error("Bạn chưa nhận ca ngày hôm nay! Vui lòng vào 'Lịch của tôi' để nhận ca trước khi bán hàng.");
        err.statusCode = 400;
        throw err;
    }

    return { staffId, counterId: configCounterId };
};
module.exports = {
    getAllInvoice,
    createInvoice,
    getDraftInvoices,
    getInvoiceDetail,
    updateInvoiceCustomer,
    updateInvoiceItems,
    cancelInvoice,
    syncCounter,
};
