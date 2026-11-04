const { define, decimal } = require('./schema');

module.exports = define(
    'InvoiceItem',
    'invoiceItems',
    {
        id: {
            type: Number,
            required: true,
            unique: true,
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            validate: Number.isSafeInteger
        },
        invoiceId: { type: Number, required: true, ref: 'Invoice' },
        productId: { type: Number, required: true, ref: 'Product' },
        productName: { type: String, required: true, maxlength: 255 },
        unitPrice: decimal(2, {
            required: true,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        quantity: decimal(3, {
            required: true,
            validate: { validator: (v) => Number(v.toString()) > 0 }
        }),
        lineTotal: decimal(2, {
            required: true,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        productUnitId: { type: Number, required: true, ref: 'ProductUnit' },
        unitName: { type: String, required: true, maxlength: 20 },
        baseQuantity: decimal(3, {
            required: true,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        })
    },
    [
        [
            {
                invoiceId: 1
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
                productUnitId: 1
            },
            {}
        ]
    ],
    false
);
