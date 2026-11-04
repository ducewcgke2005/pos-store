const { User, Role, RoleFeature, Feature } = require('../models');
const { options, clean } = require('./helpers');
exports.getAllUser = async () =>
    clean(await User.find({}, null, options()).sort({ id: 1 }).lean().exec());
exports.findById = async (id) =>
    clean(await User.findOne({ id }, null, options()).lean().exec());
exports.findByUsername = async (username) => {
    const user = clean(
        await User.findOne({ username }, null, options())
            .collation({ locale: 'en', strength: 2 })
            .lean()
            .exec()
    );
    if (!user) return null;
    const role = await Role.findOne({ id: user.roleId }, null, options())
        .lean()
        .exec();
    if (!role) return null;
    const links = await RoleFeature.find(
        { roleId: user.roleId },
        null,
        options()
    )
        .lean()
        .exec();
    const features = await Feature.find(
        { id: { $in: links.map((row) => row.featureId) } },
        null,
        options()
    )
        .sort({ id: 1 })
        .lean()
        .exec();
    return {
        ...user,
        roleName: role.name,
        featureList: features.map((row) => row.featureKey).join(',') || null
    };
};
exports.changeUserPassword = async (
    userId,
    passwordHash,
    requirePasswordChange = false
) => {
    await User.updateOne(
        { id: userId },
        { $set: { passwordHash, requirePasswordChange } },
        options()
    ).exec();
    return true;
};
