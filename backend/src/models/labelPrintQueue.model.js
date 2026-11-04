const { define, decimal } = require('./schema');

module.exports = define(
    'LabelPrintQueue',
    'labelPrintQueue',
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
        barcode: { type: String, required: true, maxlength: 50 },
        quantity: { type: Number, default: 1 },
        status: { type: String, default: 'Pending', maxlength: 20 },
        createdAt: { type: Date, default: Date.now }
    },
    [
        [
            {
                productId: 1
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
