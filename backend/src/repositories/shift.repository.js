const { Shift, WorkSchedule } = require('../models');
const { options, clean, insert, pick, today } = require('./helpers');
const times = (data) =>
    Object.fromEntries(
        [
            'name',
            'startTime',
            'endTime',
            'checkInStart',
            'checkInEnd',
            'checkOutDeadline'
        ]
            .filter((key) => data[key] !== undefined)
            .map((key) => [key, data[key]?.slice(0, 5) || null])
    );
exports.getAllShifts = async () =>
    clean(
        await Shift.find({}, null, options())
            .sort({ isActive: -1, startTime: 1, id: 1 })
            .lean()
            .exec()
    );
exports.getShiftById = async (id) =>
    clean(await Shift.findOne({ id }, null, options()).lean().exec());
exports.createShift = async (data) =>
    (await insert(Shift, { ...times(data), name: data.name, isActive: true }))
        .id;
exports.updateShift = async (id, data) => {
    await Shift.updateOne({ id }, { $set: times(data) }, options()).exec();
    return true;
};
exports.toggleShift = async (id) => {
    const current = await exports.getShiftById(id);
    if (!current) throw new Error('Không tìm thấy ca làm việc!');
    if (current.isActive) {
        const count = await WorkSchedule.countDocuments({
            shiftId: id,
            workDate: { $gt: today() }
        }).session(options().session || null);
        if (count)
            throw new Error(
                `Ca này còn ${count} lịch phân công trong tương lai. Hãy xóa các lịch đó trước khi ngừng sử dụng!`
            );
    }
    await Shift.updateOne(
        { id },
        { $set: { isActive: !current.isActive } },
        options()
    ).exec();
    return { newActive: current.isActive ? 0 : 1 };
};
exports.checkDuplicateName = async (name, excludeId) =>
    clean(
        await Shift.findOne(
            {
                name,
                isActive: true,
                ...(excludeId ? { id: { $ne: Number(excludeId) } } : {})
            },
            'id',
            options()
        )
            .collation({ locale: 'vi', strength: 2 })
            .lean()
            .exec()
    );
