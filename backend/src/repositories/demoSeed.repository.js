const {
    SeedRun,
    Role,
    User,
    Staff,
    Counter,
    Category,
    Product,
    ProductUnit,
    InventoryStock,
    PriceHistory,
    Supplier,
    ProductSupplier,
    SupplierProductPrice,
    Customer,
    CustomerPointLog,
    CustomerVoucherUsage,
    Promotion,
    PromotionProduct,
    Voucher,
    Invoice,
    InvoiceItem,
    Payment,
    PurchaseOrder,
    PurchaseOrderItem,
    WorkSchedule,
    Shift,
    CashHandover,
    Return,
    ReturnItem,
    Adjustment,
    AdjustmentItem,
    Problematic,
    Payroll
} = require('../models');
const { options, clean, insert } = require('./helpers');

exports.claimBatch = async (key, startedAt) =>
    clean(
        await SeedRun.findOneAndUpdate(
            { _id: key },
            { $setOnInsert: { state: 'creating', startedAt } },
            { ...options(), upsert: true, new: false }
        )
            .lean()
            .exec()
    );
exports.completeBatch = async (key, counts, completedAt) => {
    await SeedRun.updateOne(
        { _id: key, state: 'creating' },
        { $set: { state: 'completed', counts, completedAt } },
        options()
    ).exec();
};
// A QR intent belongs to Payment.status. The POS keeps its invoice editable as UNPAID.
exports.normalizePendingDemoInvoices = async () => {
    const invoices = await Invoice.find(
        { invoiceCode: /^DEMO-INV-/, status: 'PENDING' },
        'id',
        options()
    )
        .lean()
        .exec();
    const payments = await Payment.find(
        {
            invoiceId: { $in: invoices.map((invoice) => invoice.id) },
            status: 'PENDING',
            paymentMethod: 'BANK_TRANSFER'
        },
        'invoiceId',
        options()
    )
        .lean()
        .exec();
    const result = await Invoice.updateMany(
        {
            id: { $in: payments.map((payment) => payment.invoiceId) },
            invoiceCode: /^DEMO-INV-/,
            status: 'PENDING'
        },
        { $set: { status: 'UNPAID' } },
        options()
    ).exec();
    return result.modifiedCount;
};
exports.getFoundation = async () => {
    const roles = clean(await Role.find({}, null, options()).lean().exec());
    const staff = [];
    for (const username of [
        'admin@pos.com',
        'cashier@pos.com',
        'warehouse@pos.com'
    ]) {
        const user = clean(
            await User.findOne({ username }, null, options()).lean().exec()
        );
        const employee = clean(
            await Staff.findOne({ userId: user.id }, null, options())
                .lean()
                .exec()
        );
        staff.push({
            ...employee,
            username,
            roleName: roles.find((role) => role.id === user.roleId).name
        });
    }
    return {
        roles,
        staff,
        counter: clean(
            await Counter.findOne(
                { counterCode: 'COUNTER-01' },
                null,
                options()
            )
                .lean()
                .exec()
        )
    };
};
exports.createEmployee = async (userFields, staffFields) => {
    const user = await insert(User, userFields);
    return insert(Staff, { ...staffFields, userId: user.id });
};
exports.createCounter = async (data) => insert(Counter, data);
exports.createCategory = async (data) => insert(Category, data);
exports.createSupplier = async (data) => insert(Supplier, data);
exports.createCustomer = async (data) => insert(Customer, data);
exports.createProduct = async (data, unitFields, changedBy) => {
    const product = await insert(Product, data);
    const unit = await exports.createUnit(
        { ...unitFields, productId: product.id },
        changedBy,
        data.createdAt
    );
    await insert(InventoryStock, {
        productId: product.id,
        quantityOnHand: 0,
        minThreshold: data.isCombo ? 3 : 10
    });
    return { ...product, units: [unit] };
};
exports.createUnit = async (data, changedBy, changedAt) => {
    const unit = await insert(ProductUnit, data);
    await insert(PriceHistory, {
        productId: unit.productId,
        productUnitId: unit.id,
        oldSalePrice: null,
        newSalePrice: unit.salePrice,
        changedBy,
        changedAt
    });
    return unit;
};
exports.linkSupplier = async (
    supplierId,
    product,
    prices,
    createdBy,
    createdAt
) => {
    await insert(ProductSupplier, {
        supplierId,
        productId: product.id,
        status: 'ACTIVE'
    });
    for (const [index, unit] of product.units.entries())
        await insert(SupplierProductPrice, {
            supplierId,
            productId: product.id,
            unitId: unit.id,
            price: prices[index],
            createdBy,
            createdAt
        });
};
exports.createPurchaseOrder = async (data, items) => {
    const order = await insert(PurchaseOrder, data);
    for (const item of items)
        await insert(PurchaseOrderItem, { ...item, poId: order.id });
    return order;
};
exports.createPromotion = async (data, items) => {
    const promotion = await insert(Promotion, data);
    for (const item of items)
        await insert(PromotionProduct, { ...item, promotionId: promotion.id });
    return promotion;
};
exports.createVoucher = async (data) => insert(Voucher, data);
exports.createInvoiceWithItems = async (data, items, payment) => {
    const invoice = await insert(Invoice, data);
    const lines = [];
    for (const item of items)
        lines.push(
            await insert(InvoiceItem, { ...item, invoiceId: invoice.id })
        );
    if (payment) await insert(Payment, { ...payment, invoiceId: invoice.id });
    return { ...invoice, items: lines };
};
exports.recordPoints = async (
    customerId,
    invoiceId,
    pointChange,
    reason,
    createdAt
) => {
    const changed = await Customer.updateOne(
        {
            id: customerId,
            ...(pointChange < 0
                ? { loyaltyPoints: { $gte: -pointChange } }
                : {})
        },
        { $inc: { loyaltyPoints: pointChange } },
        options()
    ).exec();
    if (!changed.matchedCount)
        throw new Error('Demo points would become negative');
    return insert(CustomerPointLog, {
        customerId,
        invoiceId,
        pointChange,
        reason,
        createdAt
    });
};
exports.recordSpending = async (id, amount) =>
    Customer.updateOne(
        { id },
        { $inc: { totalSpending: amount } },
        options()
    ).exec();
exports.recordVoucherUse = async (voucherId, customerId, invoiceId, usedAt) => {
    const changed = await Voucher.updateOne(
        { id: voucherId, $expr: { $lt: ['$currentUsage', '$maxUsage'] } },
        { $inc: { currentUsage: 1 } },
        options()
    ).exec();
    if (!changed.matchedCount) throw new Error('Demo voucher usage exceeded');
    return insert(CustomerVoucherUsage, {
        voucherId,
        customerId,
        invoiceId,
        usedAt
    });
};
exports.createShift = async (data) => insert(Shift, data);
exports.findSchedule = async (staffId, shiftId, workDate) =>
    clean(
        await WorkSchedule.findOne(
            { staffId, shiftId, workDate },
            null,
            options()
        )
            .lean()
            .exec()
    );
exports.createSchedule = async (data) => insert(WorkSchedule, data);
exports.createHandover = async (data) => insert(CashHandover, data);
exports.createReturn = async (data, items) => {
    const result = await insert(Return, data);
    for (const item of items)
        await insert(ReturnItem, { ...item, returnId: result.id });
    return result;
};
exports.createAdjustment = async (data, item) => {
    const adjustment = await insert(Adjustment, data);
    await insert(AdjustmentItem, { ...item, adjustmentId: adjustment.id });
    return adjustment;
};
exports.createReport = async (data) => insert(Problematic, data);
exports.createPayroll = async (data) => insert(Payroll, data);
