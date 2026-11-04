const { RoleFeature, Feature } = require('../models');
const { options } = require('./helpers');
exports.getPermissionsByRoleId = async (roleId) => {
    const links = await RoleFeature.find({ roleId }, null, options())
        .lean()
        .exec();
    return (
        await Feature.find(
            { id: { $in: links.map((row) => row.featureId) } },
            'featureKey -_id',
            options()
        )
            .lean()
            .exec()
    ).map((row) => ({ featureKey: row.featureKey }));
};
