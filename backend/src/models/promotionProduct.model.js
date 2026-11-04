const { define, decimal } = require('./schema');

module.exports = define(
    'PromotionProduct',
    'promotionProducts',
    {
        id: {
            type: Number,
            required: true,
            unique: true,
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            validate: Number.isSafeInteger
        },
        promotionId: { type: Number, required: true, ref: 'Promotion' },
        productId: { type: Number, default: null, ref: 'Product' },
        categoryId: { type: Number, default: null, ref: 'Category' },
        productUnitId: { type: Number, default: null, ref: 'ProductUnit' }
    },
    [
        [
            {
                promotionId: 1
            },
            {}
        ],
        [
            {
                productId: 1
            },
            {}
        ],
        [
            {
                categoryId: 1
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
