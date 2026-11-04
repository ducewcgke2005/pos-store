const { Staff, User, Role } = require('../models');
const { options, clean, insert, ensureReferences, pick } = require('./helpers');
const joinedStaff = async (staff, password = false) => {
    if (!staff) return null;
    const user = await User.findOne({ id: staff.userId }, null, options())
        .lean()
        .exec();
    const role = user
        ? await Role.findOne({ id: user.roleId }, null, options()).lean().exec()
        : null;
    return {
        ...clean(staff),
        isActive: user?.isActive || null,
        roleId: user?.roleId || null,
        username: user?.username || null,
        roleName: role?.name || null,
        ...(password ? { oldPassword: user?.passwordHash || null } : {})
    };
};
exports.getAllStaff = async () => {
    const rows = await Staff.find({}, null, options())
        .sort({ id: -1 })
        .lean()
        .exec();
    const result = [];
    for (const row of rows)
        result.push(
            pick(
                await joinedStaff(row),
                'id fullName phoneNumber email employmentStatus username isActive roleId roleName'
            )
        );
    return result;
};
exports.getAllRoles = async () =>
    clean(
        await Role.find({}, 'id name description -_id', options())
            .sort({ id: 1 })
            .lean()
            .exec()
    );
exports.getStaffById = async (id) =>
    joinedStaff(
        await Staff.findOne({ id }, null, options()).lean().exec(),
        true
    );
exports.getStaffByUserId = async (userId) =>
    joinedStaff(await Staff.findOne({ userId }, null, options()).lean().exec());
exports.updateStatus = async (id, isActive) =>
    User.updateOne({ id }, { $set: { isActive } }, options()).exec();
exports.updateEmploymentStatus = async (id, employmentStatus) =>
    Staff.updateOne({ id }, { $set: { employmentStatus } }, options()).exec();
exports.atomicResign = async (id) => {
    const staff = await Staff.findOneAndUpdate(
        { id },
        { $set: { employmentStatus: 'resigned' } },
        options()
    )
        .lean()
        .exec();
    if (staff)
        await User.updateOne(
            { id: staff.userId },
            { $set: { isActive: 'locked' } },
            options()
        ).exec();
    return true;
};
exports.create = async (data) => {
    const user = await insert(User, {
        username: data.username,
        passwordHash: data.hashedPassword,
        roleId: data.roleId,
        isActive: data.status || 'active',
        createdAt: data.createdAt
    });
    await insert(Staff, {
        ...pick(data, 'fullName phoneNumber salaryType baseSalary createdAt'),
        email: data.email || null,
        userId: user.id,
        employmentStatus: 'working'
    });
    return true;
};
exports.update = async (id, data) => {
    const staff = await Staff.findOne({ id }, null, options()).lean().exec();
    if (!staff) throw new Error('Không tìm thấy nhân viên!');
    const userFields = {
        roleId: data.roleId,
        isActive: data.isActive,
        username: data.username,
        ...(data.hashedPassword ? { passwordHash: data.hashedPassword } : {})
    };
    await ensureReferences(User, userFields);
    await Staff.updateOne(
        { id },
        {
            $set: {
                ...pick(data, 'fullName phoneNumber salaryType baseSalary'),
                email: data.email || null
            }
        },
        options()
    ).exec();
    await User.updateOne(
        { id: staff.userId },
        { $set: userFields },
        options()
    ).exec();
    return true;
};
exports.getUserByUsername = async (username) =>
    clean(
        await User.findOne({ username }, 'id', options())
            .collation({ locale: 'en', strength: 2 })
            .lean()
            .exec()
    );
exports.getStaffByPhone = async (phoneNumber) =>
    clean(await Staff.findOne({ phoneNumber }, 'id', options()).lean().exec());
exports.getStaffByEmail = async (email) =>
    clean(await Staff.findOne({ email }, 'id', options()).lean().exec());
exports.getStaffByUsername = async (username) => {
    const user = await exports.getUserByUsername(username);
    return user
        ? clean(
              await Staff.findOne({ userId: user.id }, 'id', options())
                  .lean()
                  .exec()
          )
        : null;
};
exports.getStaffByEmailForUpdate = async (email, id) =>
    clean(
        await Staff.findOne({ email, id: { $ne: Number(id) } }, 'id', options())
            .lean()
            .exec()
    );
exports.getStaffByPhoneForUpdate = async (phoneNumber, id) =>
    clean(
        await Staff.findOne(
            { phoneNumber, id: { $ne: Number(id) } },
            'id',
            options()
        )
            .lean()
            .exec()
    );
exports.getStaffByUsernameForUpdate = async (username, id) => {
    const staff = await Staff.findOne({ id }, null, options()).lean().exec();
    return clean(
        await User.findOne(
            { username, id: { $ne: staff?.userId } },
            'id',
            options()
        )
            .collation({ locale: 'en', strength: 2 })
            .lean()
            .exec()
    );
};
