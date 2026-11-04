const { define, decimal } = require('../schema');

module.exports = define(
    'ProductUnit',
    'productUnits',
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
        unitName: { type: String, required: true, maxlength: 20 },
        conversionFactor: decimal(3, {
            required: true,
            validate: { validator: (v) => Number(v.toString()) > 0 }
        }),
        salePrice: decimal(2, {
            required: true,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        }),
        barcode: { type: String, default: null, maxlength: 50 },
        unitType: {
            type: String,
            required: true,
            default: 'PIECE',
            enum: ['PIECE', 'WEIGHT'],
            maxlength: 20
        }
    },
    [
        [
            {
                barcode: 1
            },
            {
                unique: true,
                partialFilterExpression: {
                    barcode: {
                        $type: 'string'
                    }
                }
            }
        ],
        [
            {
                productId: 1,
                unitName: 1
            },
            {
                name: 'UQ_ProductUnits_Product_UnitName',
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
                productId: 1
            },
            {
                unique: true,
                partialFilterExpression: {
                    conversionFactor: 1
                },
                name: 'UX_ProductUnits_OneBaseUnit'
            }
        ]
    ],
    false
);
