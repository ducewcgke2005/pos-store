const models = require('../models');
const Sequence = require('../models/sequence.model');
const { options, clean, ensureReferences } = require('./helpers');

const tableModels = {
    Roles: 'Role',
    Features: 'Feature',
    RoleFeatures: 'RoleFeature',
    Users: 'User',
    Staff: 'Staff',
    Counters: 'Counter',
    Categories: 'Category',
    Products: 'Product',
    ProductUnits: 'ProductUnit',
    InventoryStocks: 'InventoryStock',
    ProductCombos: 'ProductCombo',
    ProductSalePriceHistories: 'PriceHistory',
    Suppliers: 'Supplier',
    ProductSuppliers: 'ProductSupplier',
    SupplierProductPrices: 'SupplierProductPrice',
    Customers: 'Customer',
    Promotions: 'Promotion',
    PromotionProducts: 'PromotionProduct',
    Vouchers: 'Voucher',
    Invoices: 'Invoice',
    InvoiceItems: 'InvoiceItem',
    Payments: 'Payment',
    CustomerPointLogs: 'CustomerPointLog',
    CustomerVoucherUsage: 'CustomerVoucherUsage',
    Returns: 'Return',
    ReturnItems: 'ReturnItem',
    PurchaseOrders: 'PurchaseOrder',
    PurchaseOrderItems: 'PurchaseOrderItem',
    InventoryAdjustments: 'Adjustment',
    InventoryAdjustmentItems: 'AdjustmentItem',
    ProblematicGoodsReport: 'Problematic',
    Shifts: 'Shift',
    WorkSchedules: 'WorkSchedule',
    CashHandovers: 'CashHandover',
    Payrolls: 'Payroll',
    LabelPrintQueue: 'LabelPrintQueue',
    VnPayTransactions: 'VnPayTransaction'
};
const keys = {
    InventoryStocks: ['productId'],
    ProductSuppliers: ['productId', 'supplierId'],
    RoleFeatures: ['roleId', 'featureId']
};
const computed = {
    CashHandovers: ['difference'],
    PurchaseOrderItems: ['total', 'receivedTotal']
};
const canonical = (value) =>
    JSON.stringify(value instanceof Date ? value.toISOString() : value);

const normalize = (Model, table, row) => {
    const data = { ...row };
    for (const field of computed[table] || []) delete data[field];
    for (const [field, value] of Object.entries(data)) {
        if (!Model.schema.path(field))
            throw new Error(`Unknown export field: ${table}.${field}`);
        if (
            Model.schema.path(field).instance === 'Date' &&
            typeof value === 'string'
        ) {
            // SQL datetime values have no zone. Source business time is Asia/Saigon.
            data[field] = new Date(
                /[zZ]$|[+-]\d{2}:\d{2}$/.test(value)
                    ? value
                    : `${value.replace(' ', 'T')}+07:00`
            );
        }
        if (field === 'workDate') data[field] = String(value).slice(0, 10);
        if (
            Model.modelName === 'Shift' &&
            /Time$|^checkIn|^checkOut/.test(field) &&
            value
        )
            data[field] = String(value).includes('T')
                ? String(value).split('T')[1].slice(0, 5)
                : String(value).slice(0, 5);
        if (
            ['barcode', 'email', 'transactionId', 'txnRef'].includes(field) &&
            value === ''
        )
            data[field] = null;
    }
    return data;
};

exports.importTables = async (tables, session) => {
    const summary = {};
    for (const table of Object.keys(tables))
        if (!tableModels[table] || !Array.isArray(tables[table]))
            throw new Error(`Unsupported export table: ${table}`);
    for (const [table, rows] of Object.entries(tables)) {
        const Model = models[tableModels[table]];
        let inserted = 0;
        for (const row of rows) {
            const data = normalize(Model, table, row);
            const identity = {};
            for (const field of keys[table] || ['id']) {
                if (
                    !Number.isSafeInteger(Number(data[field])) ||
                    Number(data[field]) <= 0
                )
                    throw new Error(`Invalid export key: ${table}.${field}`);
                identity[field] = Number(data[field]);
            }
            const candidate = new Model(data);
            await candidate.validate();
            const existing = clean(
                await Model.findOne(identity, null, options(session))
                    .lean()
                    .exec()
            );
            if (existing) {
                const normalized = clean(candidate);
                // Compare exported fields only; never overwrite live business data on rerun.
                for (const field of Object.keys(data))
                    if (
                        canonical(existing[field]) !==
                        canonical(normalized[field])
                    )
                        throw new Error(
                            `Export conflicts with existing data: ${table}.${field}`
                        );
            } else {
                await candidate.save(options(session));
                inserted++;
            }
            if (data.id != null)
                await Sequence.updateOne(
                    { _id: Model.collection.name },
                    { $max: { value: Number(data.id) } },
                    { ...options(session), upsert: true }
                ).exec();
        }
        summary[table] = { inserted, unchanged: rows.length - inserted };
    }
    // Validate every FK after staging the complete export, including forward references.
    for (const [table, rows] of Object.entries(tables)) {
        const Model = models[tableModels[table]];
        for (const row of rows)
            await ensureReferences(
                Model,
                normalize(Model, table, row),
                session
            );
    }
    return summary;
};
exports.tableModels = tableModels;
