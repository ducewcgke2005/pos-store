const { WorkSchedule, Shift, CashHandover } = require('../models');
const { options, clean, insert, timeDate, day } = require('./helpers');
const staff = require('./staff.repository');
exports.assignShift = async (staffId, shiftId, workDate) => {
    await insert(WorkSchedule, {
        staffId,
        shiftId,
        workDate: day(workDate),
        status: 'assigned'
    });
    return true;
};
exports.checkExisting = async (staffId, shiftId, workDate) =>
    clean(
        await WorkSchedule.findOne(
            { staffId, shiftId, workDate: day(workDate) },
            'id',
            options()
        )
            .lean()
            .exec()
    );
const joinedSchedule = async (row) => {
    if (!row) return null;
    const shift = await Shift.findOne({ id: row.shiftId }, null, options())
        .lean()
        .exec();
    return {
        ...clean(row),
        workDate: new Date(`${row.workDate}T00:00:00Z`),
        shiftName: shift?.name || null,
        startTime: timeDate(shift?.startTime),
        endTime: timeDate(shift?.endTime)
    };
};
exports.getStaffSchedulesInDay = async (staffId, workDate) => {
    const rows = await WorkSchedule.find(
        { staffId, workDate: day(workDate), status: { $ne: 'absent' } },
        null,
        options()
    )
        .sort({ id: 1 })
        .lean()
        .exec();
    const result = [];
    for (const row of rows) result.push(await joinedSchedule(row));
    return result;
};
exports.removeShift = async (id) => {
    if (
        await CashHandover.exists({ scheduleId: id }).session(
            options().session || null
        )
    )
        throw new Error('Lịch làm việc đã có bàn giao.');
    await WorkSchedule.deleteOne({ id }, options()).exec();
    return true;
};
exports.getWeeklySchedule = async (startDate, endDate) => {
    const staffs = (await staff.getAllStaff()).filter(
        (row) =>
            row.employmentStatus === 'working' && row.roleName === 'Cashier'
    );
    const result = [];
    for (const employee of staffs.sort(
        (a, b) => a.fullName.localeCompare(b.fullName) || a.id - b.id
    )) {
        const schedules = await WorkSchedule.find(
            {
                staffId: employee.id,
                workDate: { $gte: day(startDate), $lte: day(endDate) }
            },
            null,
            options()
        )
            .sort({ workDate: 1, id: 1 })
            .lean()
            .exec();
        for (const schedule of schedules.length ? schedules : [null]) {
            const joined = await joinedSchedule(schedule);
            result.push({
                staffId: employee.id,
                fullName: employee.fullName,
                roleName: employee.roleName,
                scheduleId: schedule?.id || null,
                workDate: joined?.workDate || null,
                shiftId: schedule?.shiftId || null,
                shiftName: joined?.shiftName || null,
                startTime: joined?.startTime || null,
                endTime: joined?.endTime || null,
                status: schedule?.status || null
            });
        }
    }
    return result;
};
exports.getScheduleById = async (id) =>
    joinedSchedule(
        await WorkSchedule.findOne({ id }, null, options()).lean().exec()
    );
exports.getStaffRole = async (id) =>
    (await staff.getStaffById(id))?.roleName || '';
exports.clearStaffSchedulesInRange = async ({
    staffId,
    startDate,
    endDate,
    today,
    currentTime
}) => {
    const schedules = await WorkSchedule.find(
        {
            staffId,
            workDate: { $gte: day(startDate), $lte: day(endDate) },
            status: 'assigned'
        },
        null,
        options()
    )
        .lean()
        .exec();
    const ids = [];
    for (const row of schedules) {
        const shift = await Shift.findOne({ id: row.shiftId }, null, options())
            .lean()
            .exec();
        if (
            row.workDate > day(today) ||
            (row.workDate === day(today) && shift?.startTime > currentTime)
        )
            ids.push(row.id);
    }
    return (
        await WorkSchedule.deleteMany({ id: { $in: ids } }, options()).exec()
    ).deletedCount;
};
