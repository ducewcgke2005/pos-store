const { define, decimal } = require('./schema');

module.exports = define(
    'PurchaseOrderItem',
    'purchaseOrderItems',
    {
        id: {
            type: Number,
            required: true,
            unique: true,
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            validate: Number.isSafeInteger
        },
        poId: { type: Number, required: true, ref: 'PurchaseOrder' },
        productUnitId: { type: Number, required: true, ref: 'ProductUnit' },
        quantity: decimal(3, {
            required: true,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        costPrice: decimal(2, {
            required: true,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        note: { type: String, default: null, maxlength: 500 },
        receivedQuantity: decimal(3, {
            default: 0,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        })
    },
    [
        [
            {
                poId: 1
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
