const { define, decimal } = require('./schema');

module.exports = define(
    'ReturnItem',
    'returnItems',
    {
        id: {
            type: Number,
            required: true,
            unique: true,
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            validate: Number.isSafeInteger
        },
        returnId: { type: Number, required: true, ref: 'Return' },
        invoiceItemId: { type: Number, required: true, ref: 'InvoiceItem' },
        productId: { type: Number, required: true, ref: 'Product' },
        quantity: decimal(3, {
            required: true,
            validate: { validator: (v) => Number(v.toString()) > 0 }
        }),
        refundAmount: decimal(2, {
            required: true,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        productName: { type: String, default: null, maxlength: 250 },
        restockApproved: {
            type: String,
            default: 'Pending',
            enum: ['Pending', 'Approved', 'Rejected', 'Cancel'],
            maxlength: 20
        },
        checkedAt: { type: Date, default: null },
        checkedBy: { type: Number, default: null, ref: 'Staff' },
        productUnitId: { type: Number, default: null, ref: 'ProductUnit' },
        unitName: { type: String, default: null, maxlength: 20 },
        baseQuantity: decimal(3, {
            default: null,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        })
    },
    [
        [
            {
                returnId: 1
            },
            {}
        ],
        [
            {
                invoiceItemId: 1
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
