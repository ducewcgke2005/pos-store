const { test } = require('node:test');
const assert = require('node:assert/strict');
const models = require('../src/models');
const { clean } = require('../src/repositories/helpers');

test('Mongoose models contain data schemas, with stable public keys and no legacy query statics', () => {
    for (const Model of Object.values(models)) {
        assert.ok(Model.schema.options.collection);
        assert.equal(Model.schema.options.versionKey, false);
        if (Model.schema.path('id'))
            assert.equal(Model.schema.path('id').instance, 'Number');
        assert.deepEqual(Object.keys(Model.schema.statics), []);
    }
});
test('decimal API serialization preserves numbers and removes BSON identity recursively', () => {
    const row = new models.InvoiceItem({
        id: 1,
        invoiceId: 1,
        productId: 1,
        productUnitId: 1,
        productName: 'Lịch sử',
        unitName: 'Kg',
        quantity: 0.125,
        baseQuantity: 0.125,
        unitPrice: 12345.67,
        lineTotal: 1543.21
    });
    assert.equal(row.validateSync(), undefined);
    const result = clean(row);
    assert.equal(result.unitPrice, 12345.67);
    assert.equal(result.quantity, 0.125);
    assert.ok(!Object.hasOwn(result, '_id'));
});
test('invalid numeric data and wrong status casing fail schema validation', () => {
    assert.ok(new models.Customer({ id: 1, loyaltyPoints: -1 }).validateSync());
    assert.ok(new models.Customer({ id: 1, status: 'ACTIVE' }).validateSync());
    assert.ok(
        new models.ProductUnit({
            id: 1,
            productId: 1,
            unitName: 'Cái',
            conversionFactor: 0,
            salePrice: 10
        }).validateSync()
    );
    assert.ok(
        new models.Payment({
            id: 1,
            invoiceId: 1,
            amount: -1,
            paymentMethod: 'CASH',
            status: 'SUCCESS'
        }).validateSync()
    );
});

test('decimal rounding uses base 10, including half-cent boundaries and fractional quantities', () => {
    const row = new models.InvoiceItem({ unitPrice: 1.005, quantity: 1.0005 });
    assert.equal(clean(row).unitPrice, 1.01);
    assert.equal(clean(row).quantity, 1.001);
    const exponential = new models.InvoiceItem({
        unitPrice: 1e3,
        quantity: 1e-3
    });
    assert.equal(clean(exponential).unitPrice, 1000);
    assert.equal(clean(exponential).quantity, 0.001);
});
