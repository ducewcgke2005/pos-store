const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
process.env.JWT_SECRET = 'localstore-test-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.MONGOMS_DOWNLOAD_DIR = path.resolve(__dirname, '../.cache/mongodb');
process.env.MONGOMS_DOWNLOAD_IGNORE_MISSING_HEADER = 'true';
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { disconnectDB } = require('../src/config/database');
const models = require('../src/models');
const { clean } = require('../src/repositories/helpers');
const { runInTransaction } = require('../src/infrastructure/transaction');
const seed = require('../src/services/seed.service');
const stockRepository = require('../src/repositories/productStock.repository');
const invoiceRepository = require('../src/repositories/invoice.repository');
const paymentRepository = require('../src/repositories/payment.repository');
const sse = require('../src/services/sse.service');
const socket = require('../src/services/socket.service');
let replica,
    server,
    base,
    token,
    serial = 0;
const events = [];

const request = async (method, url, data, authenticated = true) => {
    const response = await fetch(base + url, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(authenticated ? { Authorization: `Bearer ${token}` } : {})
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) })
    });
    const body = await response.json();
    return { status: response.status, body };
};
const ok = (response, status = 200) => {
    assert.equal(response.status, status, JSON.stringify(response.body));
    return response.body;
};
const catalog = async (stock = 10, price = 20000) => {
    const code = `TEST-${++serial}`;
    const created = ok(
        await request('POST', '/api/products', {
            code,
            name: `Sản phẩm ${serial}`,
            baseUnit: 'Cái',
            salePrice: price,
            barcode: code
        }),
        201
    );
    const product = ok(
        await request('GET', `/api/products/${created.id}`)
    ).data;
    await runInTransaction((session) =>
        stockRepository.addStock(session, product.id, stock)
    );
    return { ...product, unitId: product.units[0].id };
};
const draft = async (product, quantity = 1, customerId) =>
    ok(
        await request('POST', '/api/invoices', {
            items: [
                {
                    productId: product.id,
                    productUnitId: product.unitId,
                    quantity
                }
            ],
            customerId
        }),
        201
    ).data;
const cash = async (invoice) =>
    request('POST', `/api/payment/${invoice.id}/pay-cash`, {
        payment: { method: 'CASH' }
    });
const invoiceState = async (id) =>
    clean(await models.Invoice.findOne({ id }).lean());
const paymentState = async (invoiceId) =>
    clean(await models.Payment.find({ invoiceId }).lean());
const stockState = async (productId) =>
    clean(await models.InventoryStock.findOne({ productId }).lean());

before(
    async () => {
        replica = await MongoMemoryReplSet.create({
            binary: {
                version: '7.0.14',
                downloadDir: process.env.MONGOMS_DOWNLOAD_DIR
            },
            replSet: { count: 1, storageEngine: 'wiredTiger' }
        });
        const uri = replica.getUri('localstore_pos_test');
        const { start } = require('../src/index');
        server = await start({ port: 0, uri });
        base = `http://127.0.0.1:${server.address().port}`;
        await seed.seedDevelopment('123456');
        token = ok(
            await request(
                'POST',
                '/api/auth/login',
                { username: 'admin@pos.com', password: '123456' },
                false
            )
        ).data?.token;
        if (!token) {
            const login = ok(
                await request(
                    'POST',
                    '/api/auth/login',
                    { username: 'admin@pos.com', password: '123456' },
                    false
                )
            );
            token = login.token || login.data?.token;
        }
        assert.ok(token, 'Login must return a token');
        sse.send = (event) => events.push({ type: 'sse', event });
        socket.emitInventoryUpdate = (stocks) =>
            events.push({ type: 'stock', stocks });
    },
    { timeout: 900000 }
);

after(async () => {
    if (server) {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();
    if (replica) await replica.stop();
});

test('barcode, numeric IDs, decimal JSON and draft leave stock unchanged', async () => {
    const product = await catalog(3.125, 12345.67);
    const byBarcode = ok(
        await request(
            'GET',
            `/api/products/pos/barcode?search=${product.barcode}`
        )
    );
    assert.equal(byBarcode.data[0].id, product.id);
    assert.equal(typeof byBarcode.data[0].id, 'number');
    assert.equal(byBarcode.data[0].units[0].price, 12345.67);
    assert.doesNotMatch(
        JSON.stringify(byBarcode),
        /"_id"|"__v"|\$numberDecimal/
    );
    const invoice = await draft(product);
    assert.match(invoice.invoiceCode, /^INV\d{8}-\d{6,}$/);
    assert.equal((await stockState(product.id)).quantityOnHand, 3.125);
    assert.equal((await invoiceState(invoice.id)).status, 'UNPAID');
    assert.equal((await paymentState(invoice.id)).length, 0);
});

test('cash payment commits stock, payment, invoice and earned points together', async () => {
    const customer = ok(
        await request('POST', '/api/customers', {
            name: 'Nguyễn Văn An',
            phone: `091${String(++serial).padStart(7, '0')}`
        }),
        201
    ).data;
    const product = await catalog(2, 20000);
    const invoice = await draft(product, 1, customer.id);
    ok(await cash(invoice));
    assert.equal((await stockState(product.id)).quantityOnHand, 1);
    assert.equal((await invoiceState(invoice.id)).status, 'PAID');
    assert.deepEqual(
        (await paymentState(invoice.id)).map((row) => [
            row.paymentMethod,
            row.status,
            row.amount
        ]),
        [['CASH', 'SUCCESS', 20000]]
    );
    assert.equal(
        (await models.Customer.findOne({ id: customer.id }).lean())
            .loyaltyPoints,
        2
    );
    assert.equal(
        await models.CustomerPointLog.countDocuments({ invoiceId: invoice.id }),
        1
    );
    assert.equal((await cash(invoice)).status, 400);
    assert.equal((await stockState(product.id)).quantityOnHand, 1);
});

test('insufficient stock rolls back all payment and point effects, with no socket event', async () => {
    const product = await catalog(0);
    const invoice = await draft(product);
    const beforeEvents = events.length;
    const response = await cash(invoice);
    assert.equal(response.status, 400);
    assert.match(response.body.message, /Insufficient stock/);
    assert.equal((await invoiceState(invoice.id)).status, 'UNPAID');
    assert.equal((await paymentState(invoice.id)).length, 0);
    assert.equal((await stockState(product.id)).quantityOnHand, 0);
    assert.equal(events.length, beforeEvents);
});

test('two counters competing for the last unit allow exactly one payment', async () => {
    const product = await catalog(1);
    const first = await draft(product),
        second = await draft(product);
    const responses = await Promise.all([cash(first), cash(second)]);
    assert.deepEqual(responses.map((row) => row.status).sort(), [200, 400]);
    assert.equal((await stockState(product.id)).quantityOnHand, 0);
    assert.equal(
        await models.Invoice.countDocuments({
            id: { $in: [first.id, second.id] },
            status: 'PAID'
        }),
        1
    );
    assert.equal(
        await models.Payment.countDocuments({
            invoiceId: { $in: [first.id, second.id] },
            status: 'SUCCESS'
        }),
        1
    );
});

test('repeated and concurrent bank webhooks change data only once', async () => {
    const product = await catalog(3);
    const invoice = await draft(product);
    const qr = ok(
        await request('POST', '/api/payment/create-qr', {
            invoiceId: invoice.id
        })
    );
    const payload = {
        id: `TX-${++serial}`,
        content: qr.data.qr.content,
        transferAmount: 20000
    };
    const beforeEvents = events.filter((row) => row.type === 'sse').length;
    const responses = await Promise.all([
        request('POST', '/api/payment/webhook', payload, false),
        request('POST', '/api/payment/webhook', payload, false)
    ]);
    responses.forEach((row) => ok(row));
    ok(await request('POST', '/api/payment/webhook', payload, false));
    assert.equal((await stockState(product.id)).quantityOnHand, 2);
    assert.equal((await paymentState(invoice.id)).length, 1);
    assert.equal((await paymentState(invoice.id))[0].transactionId, payload.id);
    assert.equal(
        events.filter((row) => row.type === 'sse').length - beforeEvents,
        1
    );
});

test('a transaction failure after stock and points writes restores every collection', async () => {
    const product = await catalog(2);
    const customer = ok(
        await request('POST', '/api/customers', {
            name: 'Nguyễn Văn Bình',
            phone: `092${String(++serial).padStart(7, '0')}`
        }),
        201
    ).data;
    const invoice = await draft(product, 1, customer.id);
    const original = invoiceRepository.updateStatus;
    const beforeEvents = events.length;
    invoiceRepository.updateStatus = async (...args) => {
        await original(...args);
        throw new Error('INJECTED_FAILURE_AFTER_STATUS');
    };
    try {
        assert.equal((await cash(invoice)).status, 400);
    } finally {
        invoiceRepository.updateStatus = original;
    }
    assert.equal((await invoiceState(invoice.id)).status, 'UNPAID');
    assert.equal((await stockState(product.id)).quantityOnHand, 2);
    assert.equal((await paymentState(invoice.id)).length, 0);
    assert.equal(
        (await models.Customer.findOne({ id: customer.id }).lean())
            .loyaltyPoints,
        0
    );
    assert.equal(
        await models.CustomerPointLog.countDocuments({ invoiceId: invoice.id }),
        0
    );
    assert.equal(events.length, beforeEvents);
});

test('seed is repeatable and does not duplicate users, roles or permissions', async () => {
    const before = [
        await models.User.countDocuments(),
        await models.Role.countDocuments(),
        await models.RoleFeature.countDocuments()
    ];
    await seed.seedDevelopment('a different password');
    assert.deepEqual(
        [
            await models.User.countDocuments(),
            await models.Role.countDocuments(),
            await models.RoleFeature.countDocuments()
        ],
        before
    );
    ok(
        await request(
            'POST',
            '/api/auth/login',
            { username: 'admin@pos.com', password: '123456' },
            false
        )
    );
});

test('module read endpoints retain their response contract on empty and populated joins', async () => {
    const urls = [
        '/api/users',
        '/api/categories',
        '/api/categories/tree',
        '/api/categories/all',
        '/api/products',
        '/api/products/pos',
        '/api/product-units',
        '/api/customers',
        '/api/promotions',
        '/api/promotions/active',
        '/api/promotions/report',
        '/api/vouchers',
        '/api/vouchers/report',
        '/api/invoices',
        '/api/invoices/drafts',
        '/api/returns',
        '/api/return-items?status=Pending',
        '/api/inventory/categories',
        '/api/inventory/products/search?keyword=TEST',
        '/api/inventory/products/low-stock',
        '/api/inventory/product-units/search?keyword=TEST',
        '/api/inventory/suppliers/list',
        '/api/inventory/reports/list',
        '/api/inventory/purchase-orders/list',
        '/api/inventory/purchase-orders/report?month=11&year=2026',
        '/api/inventory/adjustments/list',
        '/api/staff',
        '/api/staff/roles',
        '/api/shifts',
        '/api/roster?startDate=2026-11-02&endDate=2026-11-08',
        '/api/salary?month=11&year=2026',
        '/api/salary/roles',
        '/api/salary/payroll-status?month=11&year=2026',
        '/api/cashier/my-schedule?startDate=2026-11-02&endDate=2026-11-08',
        '/api/cashier/handover/pending?workDate=2026-11-02',
        '/api/cashier/handover/report?page=1&pageSize=10',
        '/api/cashier/daily-audit?workDate=2026-11-02',
        '/api/attendance/check-pending',
        '/api/attendance/check-working',
        '/api/dashboard/summary'
    ];
    for (const url of urls) {
        const response = await request('GET', url);
        assert.equal(
            response.status,
            200,
            `${url}: ${JSON.stringify(response.body)}`
        );
        assert.equal(response.body.success, true, url);
        assert.doesNotMatch(
            JSON.stringify(response.body),
            /"_id"|"__v"|\$numberDecimal/,
            url
        );
    }
});

test('voucher and redeemed points survive QR confirmation and duplicate webhook exactly once', async () => {
    const customer = ok(
        await request('POST', '/api/customers', {
            name: 'Nguyễn Văn Cường',
            phone: `093${String(++serial).padStart(7, '0')}`,
            loyaltyPoints: 10
        }),
        201
    ).data;
    const product = await catalog(3, 50000);
    const voucher = ok(
        await request('POST', '/api/vouchers', {
            code: `V-${++serial}`,
            type: 'Fixed',
            value: 10000,
            maxUsage: 1
        }),
        201
    ).data;
    const invoice = await draft(product, 1, customer.id);
    const qr = ok(
        await request('POST', '/api/payment/create-qr', {
            invoiceId: invoice.id,
            discount: { voucherId: voucher.id, pointUsed: 5 }
        })
    ).data;
    assert.equal(qr.finalAmount, 39500);
    assert.equal(
        (await models.Customer.findOne({ id: customer.id }).lean())
            .loyaltyPoints,
        10
    );
    assert.equal((await stockState(product.id)).quantityOnHand, 3);
    const payload = {
        id: `TX-${++serial}`,
        content: qr.qr.content,
        transferAmount: qr.finalAmount
    };
    ok(await request('POST', '/api/payment/webhook', payload, false));
    ok(await request('POST', '/api/payment/webhook', payload, false));
    assert.equal((await invoiceState(invoice.id)).finalAmount, 39500);
    assert.equal((await paymentState(invoice.id))[0].amount, 39500);
    assert.equal(
        (await models.Customer.findOne({ id: customer.id }).lean())
            .loyaltyPoints,
        8
    );
    assert.equal(
        await models.CustomerPointLog.countDocuments({ invoiceId: invoice.id }),
        2
    );
    assert.equal(
        (await models.Voucher.findOne({ id: voucher.id }).lean()).currentUsage,
        1
    );
    assert.equal((await stockState(product.id)).quantityOnHand, 2);
    const second = await draft(product);
    ok(
        await request('POST', '/api/payment/create-qr', {
            invoiceId: second.id
        })
    );
    const reused = await request(
        'POST',
        '/api/payment/webhook',
        { ...payload, content: `POS-${second.id}`, transferAmount: 50000 },
        false
    );
    assert.equal(reused.status, 400);
    assert.equal((await invoiceState(second.id)).status, 'UNPAID');
    assert.equal((await stockState(product.id)).quantityOnHand, 2);
});

test('historical invoice lines and numeric return references survive catalog changes', async () => {
    const product = await catalog(3, 15000);
    const invoice = await draft(product);
    ok(await cash(invoice));
    const original = ok(await request('GET', `/api/invoices/${invoice.id}`))
        .data.items[0];
    ok(
        await request('PUT', `/api/products/${product.id}`, {
            code: product.code,
            name: 'Tên sau khi đổi',
            baseUnit: 'Gói mới',
            salePrice: 25000,
            barcode: product.barcode
        })
    );
    const historical = ok(await request('GET', `/api/invoices/${invoice.id}`))
        .data.items[0];
    assert.equal(historical.productName, original.productName);
    assert.equal(historical.unitName, original.unitName);
    assert.equal(historical.unitPrice, 15000);
    const ret = ok(
        await request('POST', '/api/returns', {
            invoiceId: invoice.id,
            reason: 'Đổi ý',
            items: [{ invoiceItemId: original.id, quantity: 1 }]
        })
    ).data;
    ok(await request('PATCH', `/api/returns/${ret.returnId}/approve`, {}));
    const detail = ok(await request('GET', `/api/invoices/${invoice.id}`)).data;
    assert.equal(detail.items[0].returnedQuantity, 1);
    assert.equal(detail.totalRefund, 15000);
    const line = await models.ReturnItem.findOne({
        returnId: ret.returnId
    }).lean();
    const responses = await Promise.all([
        request('PATCH', `/api/return-items/restock/${line.id}/approve`, {}),
        request('PATCH', `/api/return-items/restock/${line.id}/approve`, {})
    ]);
    assert.deepEqual(responses.map((row) => row.status).sort(), [200, 400]);
    assert.equal((await stockState(product.id)).quantityOnHand, 3);
});

test('offline SQL export import is idempotent, validates references and advances numeric counters', async () => {
    const { importExport } = require('../src/services/migration.service');
    const payload = {
        schemaVersion: 1,
        tables: {
            Customers: [
                {
                    id: 1000,
                    phone: '0987654321',
                    name: 'Khách lịch sử',
                    loyaltyPoints: 7,
                    totalSpending: '12345.67',
                    status: 'Active',
                    createdAt: '2025-01-02T03:04:05',
                    updatedAt: '2025-01-02T03:04:05'
                }
            ]
        }
    };
    assert.equal((await importExport(payload)).Customers.inserted, 1);
    assert.equal((await importExport(payload)).Customers.unchanged, 1);
    assert.equal(
        clean(await models.Customer.findOne({ id: 1000 }).lean()).totalSpending,
        12345.67
    );
    const next = ok(
        await request('POST', '/api/customers', {
            name: 'Nguyễn Văn Dũng',
            phone: `094${String(++serial).padStart(7, '0')}`
        }),
        201
    ).data;
    assert.ok(next.id > 1000);
    await assert.rejects(
        importExport({
            schemaVersion: 1,
            tables: {
                CustomerPointLogs: [
                    { id: 9000, customerId: 999999, pointChange: 1 }
                ]
            }
        }),
        /liên kết/
    );
    assert.equal(await models.CustomerPointLog.countDocuments({ id: 9000 }), 0);
});

test('purchase receipts preserve supplier price snapshots and conditionally reject over-receiving', async () => {
    const product = await catalog(0, 25000);
    const supplier = ok(
        await request('POST', '/api/inventory/create/supplier', {
            name: `Nhà cung cấp ${++serial}`
        }),
        201
    ).data;
    ok(
        await request(
            'POST',
            `/api/inventory/suppliers/${supplier.id}/products`,
            {
                productId: product.id,
                productUnitId: product.unitId,
                price: 12000
            }
        ),
        201
    );
    const created = ok(
        await request('POST', '/api/inventory/purchase-orders/request', {
            note: 'Kiểm thử',
            items: [
                {
                    supplierId: supplier.id,
                    productUnitId: product.unitId,
                    quantity: 5
                }
            ]
        })
    ).data;
    const poId = created[0];
    const detail = ok(
        await request('GET', `/api/inventory/purchase-orders/detail/${poId}`)
    ).data;
    assert.equal(detail.totalAmount, 60000);
    assert.equal(detail.items[0].costPrice, 12000);
    const poiId = detail.items[0].id;
    ok(
        await request(
            'PATCH',
            `/api/inventory/purchase-orders/receive/${poId}`,
            { items: [{ poiId, receivedQuantity: 2 }] }
        )
    );
    assert.equal((await stockState(product.id)).quantityOnHand, 2);
    assert.equal(
        clean(await models.PurchaseOrder.findOne({ id: poId }).lean())
            .totalAmount,
        24000
    );
    assert.equal(
        clean(await models.PurchaseOrder.findOne({ id: poId }).lean()).status,
        'PartiallyReceived'
    );
    const competing = await Promise.all([
        request('PATCH', `/api/inventory/purchase-orders/receive/${poId}`, {
            items: [{ poiId, receivedQuantity: 3 }]
        }),
        request('PATCH', `/api/inventory/purchase-orders/receive/${poId}`, {
            items: [{ poiId, receivedQuantity: 3 }]
        })
    ]);
    assert.deepEqual(competing.map((row) => row.status).sort(), [200, 400]);
    assert.equal((await stockState(product.id)).quantityOnHand, 5);
    assert.equal(
        clean(await models.PurchaseOrder.findOne({ id: poId }).lean())
            .totalAmount,
        60000
    );
    assert.equal(
        clean(await models.PurchaseOrder.findOne({ id: poId }).lean()).status,
        'Received'
    );
    const price = ok(
        await request('GET', `/api/price-history/${product.id}/all`)
    );
    assert.equal(price.success, true);
    const date = new Date(Date.now() + 7 * 3600000);
    const report = ok(
        await request(
            'GET',
            `/api/inventory/purchase-orders/report?month=${date.getUTCMonth() + 1}&year=${date.getUTCFullYear()}&supplierId=${supplier.id}`
        )
    ).data;
    assert.equal(report.summary.totalPO, 1);
    assert.equal(report.summary.totalAmount, 60000);
    assert.equal(report.summary.totalQuantityReceived, 5);
});

test('combo assembly and approved inventory adjustment write atomically once', async () => {
    const child = await catalog(10, 10000);
    const code = `COMBO-${++serial}`;
    const comboId = ok(
        await request('POST', '/api/products', {
            code,
            name: 'Combo thử',
            baseUnit: 'Bộ',
            isCombo: true,
            salePrice: 25000,
            barcode: code
        }),
        201
    ).id;
    ok(
        await request('POST', `/api/products/${comboId}/combos`, {
            childProductId: child.id,
            quantity: 2
        }),
        201
    );
    ok(
        await request('POST', `/api/products/${comboId}/combos/assemble`, {
            quantity: 2
        }),
        201
    );
    assert.equal((await stockState(child.id)).quantityOnHand, 6);
    assert.equal((await stockState(comboId)).quantityOnHand, 2);
    const adjustmentId = ok(
        await request('POST', '/api/inventory/adjustments', {
            reason: 'Kiểm thử kiểm kê',
            items: [
                { productId: child.id, actualLargest: 4, actualRemainder: 0 }
            ]
        }),
        201
    ).data.adjustmentId;
    assert.equal((await stockState(child.id)).quantityOnHand, 6);
    const responses = await Promise.all([
        request('PATCH', `/api/inventory/adjustments/${adjustmentId}/status`, {
            status: 'Approved'
        }),
        request('PATCH', `/api/inventory/adjustments/${adjustmentId}/status`, {
            status: 'Approved'
        })
    ]);
    assert.deepEqual(responses.map((row) => row.status).sort(), [200, 400]);
    assert.equal((await stockState(child.id)).quantityOnHand, 4);
});

test('cashier attendance, handover difference and payroll snapshots keep SQL time semantics', async () => {
    const { insert } = require('../src/repositories/helpers');
    const date = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    const cashier = await models.User.findOne({
        username: 'cashier@pos.com'
    }).lean();
    const employee = await models.Staff.findOne({ userId: cashier.id }).lean();
    const hour = new Date(Date.now() + 7 * 3600000).getUTCHours();
    const startTime = `${String(Math.max(0, hour - 1)).padStart(2, '0')}:00`;
    const endTime =
        hour < 22 ? `${String(hour + 2).padStart(2, '0')}:59` : '23:59';
    const shift = ok(
        await request('POST', '/api/shifts', {
            name: `Ca kiểm thử ${++serial}`,
            startTime,
            endTime,
            checkInStart: startTime,
            checkInEnd: endTime,
            checkOutDeadline: endTime
        }),
        201
    ).data;
    const schedule = await runInTransaction(() =>
        insert(models.WorkSchedule, {
            staffId: employee.id,
            shiftId: shift.id,
            workDate: date,
            status: 'assigned'
        })
    );
    const adminToken = token;
    token = ok(
        await request(
            'POST',
            '/api/auth/login',
            { username: 'cashier@pos.com', password: '123456' },
            false
        )
    ).data.token;
    try {
        ok(
            await request('POST', '/api/attendance/check-in', {
                openingCash: 100000
            })
        );
        assert.equal(
            (await models.WorkSchedule.findOne({ id: schedule.id }).lean())
                .status,
            'working'
        );
        assert.equal(
            await models.CashHandover.countDocuments({
                scheduleId: schedule.id
            }),
            1
        );
        const product = await catalog(2, 10000),
            invoice = await draft(product);
        ok(await cash(invoice));
        assert.equal(
            ok(
                await request(
                    'GET',
                    `/api/cashier/handover/system-cash?scheduleId=${schedule.id}`
                )
            ).data.systemCash,
            10000
        );
        ok(
            await request('POST', '/api/cashier/handover', {
                scheduleId: schedule.id,
                openingCash: 100000,
                actualCash: 109000
            })
        );
    } finally {
        token = adminToken;
    }
    const report = ok(
        await request(
            'GET',
            `/api/cashier/handover/report?page=1&pageSize=10&staffId=${employee.id}`
        )
    ).data;
    assert.equal(report[0].difference, -1000);
    const now = new Date(date);
    ok(
        await request('POST', '/api/salary/confirm', {
            month: now.getUTCMonth() + 1,
            year: now.getUTCFullYear()
        })
    );
    const payroll = ok(
        await request(
            'GET',
            `/api/salary?month=${now.getUTCMonth() + 1}&year=${now.getUTCFullYear()}`
        )
    ).data;
    assert.equal(
        payroll.find((row) => row.staffId === employee.id).isConfirmed,
        true
    );
});

test('two QR confirmations cannot consume the final voucher use twice', async () => {
    const product = await catalog(3, 30000);
    const voucher = ok(
        await request('POST', '/api/vouchers', {
            code: `LAST-${++serial}`,
            type: 'Fixed',
            value: 5000,
            maxUsage: 1
        }),
        201
    ).data;
    const invoices = [await draft(product), await draft(product)];
    const qrs = [];
    for (const invoice of invoices)
        qrs.push(
            ok(
                await request('POST', '/api/payment/create-qr', {
                    invoiceId: invoice.id,
                    discount: { voucherId: voucher.id }
                })
            ).data
        );
    const responses = await Promise.all(
        qrs.map((qr, index) =>
            request(
                'POST',
                '/api/payment/webhook',
                {
                    transactionId: `LAST-TX-${serial}-${index}`,
                    content: qr.qr.content,
                    transferAmount: qr.finalAmount
                },
                false
            )
        )
    );
    assert.deepEqual(responses.map((row) => row.status).sort(), [200, 400]);
    assert.equal(
        (await models.Voucher.findOne({ id: voucher.id }).lean()).currentUsage,
        1
    );
    assert.equal(
        await models.Payment.countDocuments({
            invoiceId: { $in: invoices.map((row) => row.id) },
            status: 'SUCCESS'
        }),
        1
    );
    assert.equal(
        await models.Payment.countDocuments({
            invoiceId: { $in: invoices.map((row) => row.id) },
            status: 'PENDING'
        }),
        1
    );
    assert.equal((await stockState(product.id)).quantityOnHand, 2);
});

test('invalid references roll back product creation, and unique codes remain case insensitive', async () => {
    const code = `BAD-${++serial}`;
    const before = await models.Product.countDocuments();
    const invalid = await request('POST', '/api/products', {
        code,
        name: 'Sai danh mục',
        baseUnit: 'Cái',
        salePrice: 10000,
        categoryId: 999999
    });
    assert.equal(invalid.status, 400);
    assert.equal(await models.Product.countDocuments(), before);
    assert.equal(await models.ProductUnit.countDocuments({ barcode: code }), 0);
    const product = await catalog(1);
    const duplicate = await request('POST', '/api/products', {
        code: product.code.toLowerCase(),
        name: 'Mã trùng',
        baseUnit: 'Cái',
        salePrice: 10000
    });
    assert.equal(duplicate.status, 400);
    assert.match(duplicate.body.message, /Mã sản phẩm đã tồn tại/);
});
