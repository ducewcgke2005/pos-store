const { define, decimal } = require('./schema');

module.exports = define(
    'PurchaseOrder',
    'purchaseOrders',
    {
        id: {
            type: Number,
            required: true,
            unique: true,
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            validate: Number.isSafeInteger
        },
        createdBy: { type: Number, required: true, ref: 'Staff' },
        processBy: { type: Number, default: null, ref: 'Staff' },
        supplierId: { type: Number, required: true, ref: 'Supplier' },
        status: {
            type: String,
            required: true,
            default: 'Draft',
            enum: [
                'Draft',
                'Pending',
                'Approved',
                'Rejected',
                'WaitingForDelivery',
                'Received',
                'PartiallyReceived',
                'CannotDeliver'
            ],
            maxlength: 20
        },
        createdAt: { type: Date, default: Date.now },
        note: { type: String, default: null },
        receivedBy: { type: Number, default: null, ref: 'Staff' },
        totalAmount: decimal(2, {
            default: 0,
            validate: {
                validator: (v) => v == null || Number(v.toString()) >= 0
            }
        })
    },
    [
        [{ status: 1, createdAt: -1, id: -1 }, {}],
        [
            {
                supplierId: 1
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
