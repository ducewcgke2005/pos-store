const { define, decimal } = require('../schema');

module.exports = define(
    'Product',
    'products',
    {
        id: {
            type: Number,
            required: true,
            unique: true,
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            validate: Number.isSafeInteger
        },
        code: { type: String, required: true, maxlength: 50 },
        name: { type: String, required: true, maxlength: 200 },
        categoryId: { type: Number, default: null, ref: 'Category' },
        baseUnit: { type: String, required: true, maxlength: 20 },
        allowDecimalQuantity: { type: Boolean, default: 0 },
        isCombo: { type: Boolean, default: 0 },
        status: {
            type: String,
            default: 'Selling',
            enum: ['Selling', 'StopSelling', 'Suspended'],
            maxlength: 20
        },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
        imageUrl: { type: String, default: null, maxlength: 500 }
    },
    [
        [{ status: 1, createdAt: -1, id: -1 }, {}],
        [{ categoryId: 1, status: 1, id: 1 }, {}],
        [
            {
                code: 1
            },
            {
                unique: true
            }
        ],
        [
            {
                categoryId: 1
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
    { createdAt: 'createdAt', updatedAt: 'updatedAt' }
);
