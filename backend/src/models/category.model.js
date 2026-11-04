const { define, decimal } = require('./schema');

module.exports = define(
    'Category',
    'categories',
    {
        id: {
            type: Number,
            required: true,
            unique: true,
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            validate: Number.isSafeInteger
        },
        name: { type: String, required: true, maxlength: 100 },
        parentId: { type: Number, default: null, ref: 'Category' },
        status: { type: Boolean, default: 1 },
        imageUrl: { type: String, default: null, maxlength: 500 }
    },
    [
        [
            {
                parentId: 1
            },
            {}
        ]
    ],
    false
);
