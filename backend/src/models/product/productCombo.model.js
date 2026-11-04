const { define, decimal } = require('../schema');

module.exports = define(
    'ProductCombo',
    'productCombos',
    {
        id: {
            type: Number,
            required: true,
            unique: true,
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            validate: Number.isSafeInteger
        },
        parentProductId: { type: Number, required: true, ref: 'Product' },
        childProductId: { type: Number, required: true, ref: 'Product' },
        quantity: decimal(3, {
            default: 1,
            validate: { validator: (v) => Number(v.toString()) > 0 }
        })
    },
    [
        [
            {
                parentProductId: 1,
                childProductId: 1
            },
            {
                unique: true
            }
        ],
        [
            {
                parentProductId: 1
            },
            {}
        ],
        [
            {
                childProductId: 1
            },
            {}
        ]
    ],
    false
);
