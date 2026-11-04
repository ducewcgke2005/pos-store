const {
    Role,
    Feature,
    RoleFeature,
    User,
    Staff,
    Counter
} = require('../models');
const { insert, options } = require('./helpers');
const permissions = require('../constants/permissions');

exports.seedDevelopment = async (passwordHash) => {
    const roleNames = ['Manager', 'Cashier', 'Warehouse'];
    const descriptions = ['Quản lý cửa hàng', 'Thu ngân', 'Thủ kho'];
    const features = Object.values(permissions);
    // Preserve seed role names/accounts. Include the permissions actually used by routes.
    const grants = {
        Manager: features,
        Cashier: [
            'VIEW_PRODUCT',
            'VIEW_PRODUCT_UNIT',
            'VIEW_CATEGORY',
            'VIEW_INVOICE',
            'CREATE_INVOICE',
            'SELL_POS',
            'VIEW_MY_SCHEDULE',
            'CREATE_CASH_HANDOVER',
            'VIEW_RETURN',
            'CREATE_RETURN'
        ],
        Warehouse: [
            'VIEW_PRODUCT',
            'VIEW_PRODUCT_UNIT',
            'VIEW_CATEGORY',
            'VIEW_INVENTORY',
            'UPDATE_STOCK',
            'CREATE_PURCHASE_ORDER',
            'VIEW_PURCHASE_ORDER',
            'VIEW_MY_SCHEDULE'
        ]
    };
    const featureIds = new Map();
    for (const featureKey of features) {
        let feature = await Feature.findOne({ featureKey }, null, options())
            .lean()
            .exec();
        if (!feature)
            feature = await insert(Feature, {
                featureKey,
                description: featureKey
            });
        featureIds.set(featureKey, feature.id);
    }
    const names = ['Trần Quản Lý', 'Nguyễn Thu Ngân', 'Lê Văn Kho'];
    for (const [index, name] of roleNames.entries()) {
        let role = await Role.findOne({ name }, null, options()).lean().exec();
        if (!role)
            role = await insert(Role, {
                name,
                description: descriptions[index]
            });
        for (const featureKey of grants[name]) {
            const featureId = featureIds.get(featureKey);
            if (
                featureId &&
                !(await RoleFeature.exists({
                    roleId: role.id,
                    featureId
                }).session(options().session || null))
            )
                await insert(RoleFeature, { roleId: role.id, featureId });
        }
        const username = [
            'admin@pos.com',
            'cashier@pos.com',
            'warehouse@pos.com'
        ][index];
        let user = await User.findOne({ username }, null, options())
            .lean()
            .exec();
        if (!user)
            user = await insert(User, {
                roleId: role.id,
                username,
                passwordHash,
                isActive: 'active',
                requirePasswordChange: false
            });
        if (
            !(await Staff.exists({ userId: user.id }).session(
                options().session || null
            ))
        )
            await insert(Staff, {
                userId: user.id,
                fullName: names[index],
                phoneNumber: `090000000${index + 1}`,
                email: username,
                salaryType: index === 1 ? 'hourly' : 'monthly',
                baseSalary: [20000000, 25000, 12000000][index]
            });
    }
    if (
        !(await Counter.exists({ counterCode: 'COUNTER-01' }).session(
            options().session || null
        ))
    )
        await insert(Counter, {
            counterCode: 'COUNTER-01',
            counterName: 'Quầy 1',
            status: 'ACTIVE'
        });
    return { roles: 3, accounts: 3 };
};
