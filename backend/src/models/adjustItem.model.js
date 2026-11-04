const { define, decimal } = require('./schema');

module.exports = define(
    'AdjustmentItem',
    'inventoryAdjustmentItems',
    {
        id: {
            type: Number,
            required: true,
            unique: true,
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            validate: Number.isSafeInteger
        },
        adjustmentId: { type: Number, required: true, ref: 'Adjustment' },
        productId: { type: Number, required: true, ref: 'Product' },
        systemQuantity: decimal(3, {
            default: null,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        actualQuantity: decimal(3, {
            default: null,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        })
    },
    [
        [
            {
                adjustmentId: 1
            },
            {}
        ],
        [
            {
                productId: 1
            },
            {}
        ]
    ],
    false
);
