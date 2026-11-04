const { define, decimal } = require('./schema');

module.exports = define(
    'ProductSupplier',
    'productSuppliers',
    {
        productId: { type: Number, required: true, ref: 'Product' },
        supplierId: { type: Number, required: true, ref: 'Supplier' },
        status: {
            type: String,
            required: true,
            default: 'ACTIVE',
            enum: ['ACTIVE', 'INACTIVE', 'active', 'inactive'],
            maxlength: 20
        }
    },
    [
        [
            {
                productId: 1,
                supplierId: 1
            },
            {
                unique: true
            }
        ],
        [
            {
                productId: 1
            },
            {}
        ],
        [
            {
                supplierId: 1
            },
            {}
        ]
    ],
    false
);
