const {
    Invoice,
    InvoiceItem,
    Product,
    ProductUnit,
    Customer,
    Payment,
    InventoryStock,
    Staff,
    User,
    Role,
    Counter,
    WorkSchedule
} = require('../models');
const {
    options,
    clean,
    insert,
    regex,
    pick,
    ensureReferences,
    today
} = require('./helpers');
const joinedInvoice = async (row) => {
    if (!row) return null;
    const customer = row.customerId
        ? await Customer.findOne({ id: row.customerId }, null, options())
              .lean()
              .exec()
        : null;
    const staff = await Staff.findOne({ id: row.staffId }, null, options())
        .lean()
        .exec();
    const counter = await Counter.findOne(
        { id: row.counterId },
        null,
        options()
    )
        .lean()
        .exec();
    return {
        ...row,
        customerName: customer?.name || null,
        loyaltyPoints: customer?.loyaltyPoints || 0,
        phone: customer?.phone || null,
        staffName: staff?.fullName || null,
        counterName: counter?.counterName || null
    };
};
exports.getInvoiceList = async ({
    page = 1,
    pageSize = 10,
    status,
    invoiceCode
} = {}) => {
    const filter = {
        ...(status ? { status } : {}),
        ...(invoiceCode ? { invoiceCode: regex(invoiceCode) } : {})
    };
    const totalItems = await Invoice.countDocuments(filter).session(
        options().session || null
    );
    const rows = clean(
        await Invoice.find(filter, null, options())
            .sort({ createdAt: -1, id: -1 })
            .skip((page - 1) * pageSize)
            .limit(Number(pageSize))
            .lean()
            .exec()
    );
    const data = [];
    for (const row of rows)
        data.push(
            pick(
                await joinedInvoice(row),
                'id invoiceCode createdAt finalAmount status staffId staffName counterId counterName customerId customerName'
            )
        );
    return {
        data,
        pagination: {
            page,
            pageSize,
            totalItems,
            totalPages: Math.ceil(totalItems / pageSize)
        }
    };
};
exports.insertInvoice = async (session, data) =>
    (await insert(Invoice, { ...data, status: 'UNPAID' }, session)).id;
exports.updateInvoiceCode = async (session, id, invoiceCode) =>
    Invoice.updateOne(
        { id },
        { $set: { invoiceCode } },
        options(session)
    ).exec();
exports.updateInvoiceDiscount = async (
    session,
    id,
    voucherId,
    voucherDiscount = 0,
    usedPoints = 0,
    pointDiscount = 0
) => {
    const data = {
        voucherId: voucherId || null,
        voucherDiscount,
        usedPoints,
        pointDiscount
    };
    await ensureReferences(Invoice, data, session);
    await Invoice.updateOne({ id }, { $set: data }, options(session)).exec();
};
exports.getInvoiceById = async (session, id, { forUpdate = false } = {}) => {
    // A real write on the parent replaces UPDLOCK and serializes child edits/payments/returns.
    if (forUpdate)
        return clean(
            await Invoice.findOneAndUpdate(
                { id },
                { $inc: { _revision: 1 } },
                { ...options(session), new: true }
            )
                .lean()
                .exec()
        );
    return clean(
        await Invoice.findOne({ id }, null, options(session)).lean().exec()
    );
};
exports.getInvoice = exports.getInvoiceById;
exports.getInvoiceId = exports.getInvoiceById;
exports.updateAmounts = async (session, id, data) =>
    Invoice.updateOne({ id }, { $set: data }, options(session)).exec();
exports.updateStatus = async (session, id, status) =>
    Invoice.updateOne({ id }, { $set: { status } }, options(session)).exec();
exports.deleteInvoiceItems = async (session, invoiceId) =>
    InvoiceItem.deleteMany({ invoiceId }, options(session)).exec();
exports.insertInvoiceItem = async (session, data) =>
    insert(InvoiceItem, data, session);
exports.getProductById = async (session, productId, productUnitId) => {
    const product = await Product.findOne(
        { id: productId, status: 'Selling' },
        null,
        options(session)
    )
        .lean()
        .exec();
    const unit = clean(
        await ProductUnit.findOne(
            { id: productUnitId, productId },
            null,
            options(session)
        )
            .lean()
            .exec()
    );
    return product && unit
        ? {
              id: product.id,
              name: product.name,
              productUnitId: unit.id,
              ...pick(unit, 'unitName salePrice conversionFactor')
          }
        : null;
};
exports.insertPayment = async (session, data) => insert(Payment, data, session);
exports.getDraftInvoices = async () =>
    clean(
        await Invoice.find(
            { status: { $in: ['UNPAID', 'PENDING'] } },
            'id invoiceCode createdAt finalAmount status -_id',
            options()
        )
            .sort({ createdAt: 1, id: 1 })
            .lean()
            .exec()
    );
exports.getInvoiceDetail = async (id) => {
    const invoice = await joinedInvoice(
        clean(await Invoice.findOne({ id }, null, options()).lean().exec())
    );
    if (!invoice) return null;
    const rows = clean(
        await InvoiceItem.find({ invoiceId: id }, null, options())
            .sort({ id: 1 })
            .lean()
            .exec()
    );
    const items = [];
    for (const row of rows) {
        const product = await Product.findOne(
            { id: row.productId },
            null,
            options()
        )
            .lean()
            .exec();
        const unit = await ProductUnit.findOne(
            { id: row.productUnitId },
            null,
            options()
        )
            .lean()
            .exec();
        const stock = clean(
            await InventoryStock.findOne(
                { productId: row.productId },
                null,
                options()
            )
                .lean()
                .exec()
        );
        // Keep sale snapshots even after a catalog edit; factor is historical too.
        items.push({
            ...row,
            code: product?.code || null,
            factor: row.quantity ? row.baseQuantity / row.quantity : 1,
            unitType: unit?.unitType || null,
            quantityOnHand: stock?.quantityOnHand ?? null
        });
    }
    return { ...invoice, items };
};
exports.getInvoiceItems = async (session, invoiceId) =>
    clean(
        await InvoiceItem.find({ invoiceId }, null, options(session))
            .sort({ id: 1 })
            .lean()
            .exec()
    );
exports.getPaymentByInvoiceId = async (session, invoiceId) =>
    clean(
        await Payment.findOne({ invoiceId }, null, options(session))
            .lean()
            .exec()
    );
exports.getCustomerById = async (session, id) =>
    clean(await Customer.findOne({ id }, 'id', options(session)).lean().exec());
exports.updateCustomer = async (session, id, customerId) => {
    await ensureReferences(Invoice, { customerId }, session);
    await Invoice.updateOne(
        { id },
        { $set: { customerId } },
        options(session)
    ).exec();
};
exports.getStaffAndSchedule = async (userId) => {
    const staff = await Staff.findOne({ userId }, null, options())
        .lean()
        .exec();
    if (!staff) return null;
    const user = await User.findOne({ id: userId }, null, options())
        .lean()
        .exec();
    const role = await Role.findOne({ id: user?.roleId }, null, options())
        .lean()
        .exec();
    if (!role) return null;
    const schedule = clean(
        await WorkSchedule.findOne(
            { staffId: staff.id, workDate: today(), status: 'working' },
            null,
            options()
        )
            .sort({ id: 1 })
            .lean()
            .exec()
    );
    return { staffId: staff.id, roleName: role.name, schedule };
};
exports.getCounterName = async (id) =>
    (await Counter.findOne({ id }, null, options()).lean().exec())
        ?.counterName || 'Quầy';
exports.checkInSchedule = async (id) =>
    WorkSchedule.updateOne(
        { id },
        { $set: { status: 'working' } },
        options()
    ).exec();
exports.updateInvoiceExpire = async (session, id, expiresAt) =>
    (
        await Invoice.updateOne(
            { id },
            { $set: { expiresAt } },
            options(session)
        ).exec()
    ).matchedCount;
