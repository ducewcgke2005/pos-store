const { define, decimal } = require('./schema');

module.exports = define(
    'RoleFeature',
    'roleFeatures',
    {
        roleId: { type: Number, required: true, ref: 'Role' },
        featureId: { type: Number, required: true, ref: 'Feature' }
    },
    [
        [
            {
                roleId: 1,
                featureId: 1
            },
            {
                unique: true
            }
        ],
        [
            {
                roleId: 1
            },
            {}
        ],
        [
            {
                featureId: 1
            },
            {}
        ]
    ],
    false
);
