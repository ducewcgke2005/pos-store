const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const bcrypt = require('bcrypt');
process.env.MONGOMS_DOWNLOAD_DIR = path.resolve(__dirname, '../.cache/mongodb');
process.env.MONGOMS_DOWNLOAD_IGNORE_MISSING_HEADER = 'true';
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { connectDB, disconnectDB } = require('../src/config/database');
const models = require('../src/models');
const { clean } = require('../src/repositories/helpers');
const { runInTransaction } = require('../src/infrastructure/transaction');
const { seedDevelopment } = require('../src/services/seed.service');
const { seedDemo } = require('../src/services/demoSeed.service');
const repository = require('../src/repositories/demoSeed.repository');
const productService = require('../src/services/product/product.service');
const stocks = require('../src/repositories/productStock.repository');
const anchor = new Date('2026-11-02T09:30:00Z');
let replica, existingProductId;
const counts = async () => {
    const result = {};
    for (const [name, Model] of Object.entries(models))
        result[name] = await Model.countDocuments();
    return result;
};
const round = (value, scale = 2) =>
    Math.round((value + Number.EPSILON) * 10 ** scale) / 10 ** scale;

before(
    async () => {
        replica = await MongoMemoryReplSet.create({
            binary: {
                version: '7.0.14',
                downloadDir: process.env.MONGOMS_DOWNLOAD_DIR
            },
            replSet: { count: 1, storageEngine: 'wiredTiger' }
        });
        await connectDB(replica.getUri('localstore_demo_seed_test'));
        await seedDevelopment('existing-password');
        existingProductId = await productService.createProduct({
            code: 'KEEP-EXISTING',
            name: 'Hàng đang có',
            baseUnit: 'Cái',
            salePrice: 12345,
            barcode: 'EXISTING-BARCODE'
        });
        await runInTransaction((session) =>
            stocks.addStock(session, existingProductId, 9)
        );
    },
    { timeout: 900000 }
);
after(async () => {
    await disconnectDB();
    if (replica) await replica.stop();
});

test('failed demo batch rolls back products, payroll, invoices and its completion marker', async () => {
    const before = await counts();
    const original = repository.createInvoiceWithItems;
    repository.createInvoiceWithItems = async (...args) => {
        await original(...args);
        throw new Error('INJECTED_DEMO_FAILURE');
    };
    try {
        await assert.rejects(
            seedDemo('123456', { now: anchor }),
            /INJECTED_DEMO_FAILURE/
        );
    } finally {
        repository.createInvoiceWithItems = original;
    }
    assert.deepEqual(await counts(), before);
    assert.equal(
        (await stocks.getStockByProductId(null, existingProductId))
            .quantityOnHand,
        9
    );
});

test('demo data has coherent invoice, payment, stock, voucher and loyalty histories', async () => {
    const result = await seedDemo('123456', { now: anchor });
    assert.equal(result.alreadySeeded, false);
    assert.equal(result.counts.products, 50);
    assert.equal(result.counts.productUnits, 92);
    assert.equal(result.counts.categories, 12);
    assert.equal(result.counts.customers, 40);
    assert.equal(result.counts.suppliers, 6);
    assert.equal(result.counts.invoices, 93);
    assert.equal(result.counts.payments, 84);
    assert.equal(result.counts.purchaseOrders, 12);
    assert.equal(result.counts.schedules, 266);
    assert.equal(result.counts.payrolls, 5);
    const invoices = clean(await models.Invoice.find().lean());
    const lines = clean(await models.InvoiceItem.find().lean());
    const payments = clean(await models.Payment.find().lean());
    const customers = clean(await models.Customer.find().lean());
    const pointLogs = clean(await models.CustomerPointLog.find().lean());
    const units = clean(await models.ProductUnit.find().lean());
    const purchaseItems = clean(await models.PurchaseOrderItem.find().lean());
    const recipes = clean(await models.ProductCombo.find().lean());
    const returnItems = clean(await models.ReturnItem.find().lean());
    const adjustmentItems = clean(await models.AdjustmentItem.find().lean());
    const adjustments = clean(await models.Adjustment.find().lean());
    const demoProducts = clean(
        await models.Product.find({ code: /^DEMO-/ }).lean()
    );
    assert.equal(
        invoices.filter((invoice) => invoice.status === 'PAID').length,
        80
    );
    assert.equal(
        invoices.filter((invoice) => invoice.status === 'UNPAID').length,
        10
    );
    assert.equal(
        invoices.filter((invoice) => invoice.status === 'PENDING').length,
        0
    );
    assert.equal(
        invoices.filter((invoice) => invoice.status === 'CANCELLED').length,
        3
    );
    for (const invoice of invoices) {
        const items = lines.filter((line) => line.invoiceId === invoice.id);
        assert.equal(
            round(items.reduce((sum, item) => sum + item.lineTotal, 0)),
            invoice.totalAmount
        );
        assert.equal(
            round(
                invoice.totalAmount -
                    invoice.voucherDiscount -
                    invoice.pointDiscount
            ),
            invoice.finalAmount
        );
        const payment = payments.find((row) => row.invoiceId === invoice.id);
        if (invoice.status === 'PAID' || payment?.status === 'PENDING')
            assert.equal(payment.amount, invoice.finalAmount);
        else assert.equal(payment, undefined);
        for (const line of items) {
            const unit = units.find((row) => row.id === line.productUnitId);
            assert.equal(
                line.baseQuantity,
                round(line.quantity * unit.conversionFactor, 3)
            );
        }
    }
    for (const customer of customers) {
        assert.equal(
            customer.loyaltyPoints,
            pointLogs
                .filter((log) => log.customerId === customer.id)
                .reduce((sum, log) => sum + log.pointChange, 0)
        );
        assert.equal(
            customer.totalSpending,
            round(
                invoices
                    .filter(
                        (invoice) =>
                            invoice.customerId === customer.id &&
                            invoice.status === 'PAID'
                    )
                    .reduce((sum, invoice) => sum + invoice.finalAmount, 0)
            )
        );
    }
    for (const voucher of clean(await models.Voucher.find().lean())) {
        assert.equal(
            voucher.currentUsage,
            await models.CustomerVoucherUsage.countDocuments({
                voucherId: voucher.id
            })
        );
        assert.ok(voucher.currentUsage <= voucher.maxUsage);
    }
    assert.equal(
        (await models.Voucher.findOne({ code: 'DEMOHETLUOT' }).lean())
            .currentUsage,
        2
    );
    for (const product of demoProducts) {
        let expected = purchaseItems
            .filter(
                (item) =>
                    units.find((unit) => unit.id === item.productUnitId)
                        ?.productId === product.id
            )
            .reduce(
                (sum, item) =>
                    sum +
                    item.receivedQuantity *
                        units.find((unit) => unit.id === item.productUnitId)
                            .conversionFactor,
                0
            );
        expected -= lines
            .filter(
                (line) =>
                    line.productId === product.id &&
                    invoices.find((invoice) => invoice.id === line.invoiceId)
                        ?.status === 'PAID'
            )
            .reduce((sum, item) => sum + item.baseQuantity, 0);
        expected += returnItems
            .filter(
                (item) =>
                    item.productId === product.id &&
                    item.restockApproved === 'Approved'
            )
            .reduce((sum, item) => sum + item.baseQuantity, 0);
        expected += adjustmentItems
            .filter(
                (item) =>
                    item.productId === product.id &&
                    adjustments.find(
                        (adjustment) => adjustment.id === item.adjustmentId
                    )?.status === 'Approved'
            )
            .reduce(
                (sum, item) => sum + item.actualQuantity - item.systemQuantity,
                0
            );
        expected -= recipes
            .filter((recipe) => recipe.childProductId === product.id)
            .reduce((sum, recipe) => sum + recipe.quantity * 10, 0);
        if (product.isCombo) expected += 10;
        const stock = await stocks.getStockByProductId(null, product.id);
        assert.equal(stock.quantityOnHand, round(expected, 3), product.code);
        assert.ok(stock.quantityOnHand >= 0);
    }
    const existing = await models.Product.findOne({
        id: existingProductId
    }).lean();
    assert.equal(existing.code, 'KEEP-EXISTING');
    assert.equal(
        (await stocks.getStockByProductId(null, existingProductId))
            .quantityOnHand,
        9
    );
    const admin = await models.User.findOne({
        username: 'admin@pos.com'
    }).lean();
    assert.equal(
        await bcrypt.compare('existing-password', admin.passwordHash),
        true
    );
    const demoCashier = await models.User.findOne({
        username: 'demo.cashier1@pos.com'
    }).lean();
    assert.equal(
        await bcrypt.compare('123456', demoCashier.passwordHash),
        true
    );
});

test('legacy demo QR intents are repaired without charging or changing amounts, stock or points', async () => {
    const pendingPayments = clean(
        await models.Payment.find({ status: 'PENDING' }).lean()
    );
    assert.equal(pendingPayments.length, 4);
    const ids = pendingPayments.map((payment) => payment.invoiceId);
    await models.Invoice.updateMany(
        { id: { $in: ids } },
        { $set: { status: 'PENDING' } }
    );
    const beforeStocks = clean(
        await models.InventoryStock.find().sort({ productId: 1 }).lean()
    );
    const beforeCustomers = clean(
        await models.Customer.find().sort({ id: 1 }).lean()
    );
    const beforePayments = clean(
        await models.Payment.find().sort({ id: 1 }).lean()
    );
    const result = await seedDemo('different-password', { now: anchor });
    assert.equal(result.normalizedInvoices, 4);
    assert.equal(
        await models.Invoice.countDocuments({
            id: { $in: ids },
            status: 'UNPAID'
        }),
        4
    );
    assert.deepEqual(
        clean(await models.Payment.find().sort({ id: 1 }).lean()),
        beforePayments
    );
    assert.deepEqual(
        clean(await models.InventoryStock.find().sort({ productId: 1 }).lean()),
        beforeStocks
    );
    assert.deepEqual(
        clean(await models.Customer.find().sort({ id: 1 }).lean()),
        beforeCustomers
    );
    assert.equal(
        (await seedDemo('123456', { now: anchor })).normalizedInvoices,
        0
    );
});

test('re-running demo seed does not duplicate records, replenish stock or reset points/passwords', async () => {
    const before = await counts();
    const beforeStocks = clean(
        await models.InventoryStock.find().sort({ productId: 1 }).lean()
    );
    const beforeCustomers = clean(
        await models.Customer.find().sort({ id: 1 }).lean()
    );
    const result = await seedDemo('different-password', {
        now: new Date('2026-11-09T09:30:00Z')
    });
    assert.equal(result.alreadySeeded, true);
    assert.deepEqual(await counts(), before);
    assert.deepEqual(
        clean(await models.InventoryStock.find().sort({ productId: 1 }).lean()),
        beforeStocks
    );
    assert.deepEqual(
        clean(await models.Customer.find().sort({ id: 1 }).lean()),
        beforeCustomers
    );
    const demoCashier = await models.User.findOne({
        username: 'demo.cashier1@pos.com'
    }).lean();
    assert.equal(
        await bcrypt.compare('123456', demoCashier.passwordHash),
        true
    );
});
