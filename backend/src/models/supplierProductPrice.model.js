const { define, decimal } = require('./schema');

module.exports = define(
    'SupplierProductPrice',
    'supplierProductPrices',
    {
        id: {
            type: Number,
            required: true,
            unique: true,
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            validate: Number.isSafeInteger
        },
        productId: { type: Number, required: true, ref: 'Product' },
        supplierId: { type: Number, required: true, ref: 'Supplier' },
        price: decimal(2, {
            required: true,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        createdAt: { type: Date, default: Date.now },
        createdBy: { type: Number, default: null, ref: 'User' },
        unitId: { type: Number, default: null, ref: 'ProductUnit' }
    },
    [
        [{ supplierId: 1, unitId: 1, createdAt: -1, id: -1 }, {}],
        [{ productId: 1, unitId: 1, createdAt: -1, id: -1 }, {}],
        [
            {
                productId: 1
            },
            {}
        ],
        [
            {
                supplierId: 1
            },
            {}
        ],
        [
            {
                unitId: 1
            },
            {}
        ],
        [
            {
                createdAt: -1,
                id: -1
            },
            {}
        ]
    ],
    false
);
