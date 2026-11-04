const { define, decimal } = require('../schema');

module.exports = define(
    'PriceHistory',
    'productSalePriceHistories',
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
        productUnitId: { type: Number, required: true, ref: 'ProductUnit' },
        oldSalePrice: decimal(2, {
            default: null,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        newSalePrice: decimal(2, {
            default: null,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        changedBy: { type: Number, default: null, ref: 'Staff' },
        changedAt: { type: Date, required: true, default: Date.now }
    },
    [
        [{ productId: 1, changedAt: -1, id: -1 }, {}],
        [
            {
                productId: 1
            },
            {}
        ],
        [
            {
                productUnitId: 1
            },
            {}
        ]
    ],
    false
);
