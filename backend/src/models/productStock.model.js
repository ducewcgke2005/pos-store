const { define, decimal } = require('./schema');

module.exports = define(
    'InventoryStock',
    'inventoryStocks',
    {
        productId: { type: Number, required: true, ref: 'Product' },
        quantityOnHand: decimal(3, {
            required: true,
            default: 0,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        minThreshold: decimal(3, {
            required: true,
            default: 0,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        })
    },
    [
        [
            {
                productId: 1
            },
            {
                unique: true
            }
        ]
    ],
    false
);
