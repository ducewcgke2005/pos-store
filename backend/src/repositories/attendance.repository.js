const { WorkSchedule, Shift, CashHandover } = require('../models');
const { options, clean, insert, vnNow, today } = require('./helpers');
const staff = require('./staff.repository');
exports.getStaffRoleName = async (id) =>
    (await staff.getStaffById(id))?.roleName || '';
const schedulesForStaff = async (staffId, status) => {
    const rows = clean(
        await WorkSchedule.find({ staffId, status }, null, options())
            .sort({ workDate: 1, id: 1 })
            .lean()
            .exec()
    );
    const result = [];
    for (const row of rows) {
        const shift = await Shift.findOne({ id: row.shiftId }, null, options())
            .lean()
            .exec();
        result.push({ ...row, shift });
    }
    return result;
};
exports.getPendingSchedule = async (staffId) => {
    const roleName = await exports.getStaffRoleName(staffId);
    const now = vnNow().toISOString().slice(11, 19);
    const rows = (await schedulesForStaff(staffId, 'assigned'))
        .filter(
            (row) =>
                row.workDate === today() &&
                (roleName === 'Manager' ||
                    (row.shift &&
                        now >=
                            (row.shift.checkInStart || row.shift.startTime) &&
                        now < row.shift.endTime))
        )
        .sort(
            (a, b) =>
                (a.shift?.startTime || '').localeCompare(
                    b.shift?.startTime || ''
                ) || a.id - b.id
        );
    const row = rows[0];
    return row
        ? {
              scheduleId: row.id,
              shiftName: row.shift?.name || null,
              startTime: row.shift?.startTime?.slice(0, 5) || null,
              endTime: row.shift?.endTime?.slice(0, 5) || null,
              checkInEnd: row.shift?.checkInEnd?.slice(0, 5) || null,
              roleName
          }
        : null;
};
exports.processCheckIn = async (
    id,
    openingCash,
    needsCash,
    record,
    penalty
) => {
    const row = await WorkSchedule.findOne(
        { id, status: 'assigned' },
        null,
        options()
    )
        .lean()
        .exec();
    if (!row) throw new Error('Không tìm thấy ca chờ nhận hôm nay!');
    const attendanceRecord =
        record === 'OnTime'
            ? row.attendanceRecord || 'OnTime'
            : row.attendanceRecord
              ? `${row.attendanceRecord}, ${record}`
              : record;
    const result = await WorkSchedule.updateOne(
        { id, status: 'assigned' },
        {
            $set: {
                status: 'working',
                checkInTime: new Date(),
                attendanceRecord
            },
            $inc: { penaltyAmount: penalty }
        },
        options()
    ).exec();
    if (!result.matchedCount) throw new Error('Ca đã được nhận.');
    if (needsCash && openingCash != null)
        await insert(CashHandover, {
            scheduleId: id,
            openingCash,
            systemCash: 0,
            actualCash: 0
        });
    return true;
};
exports.processSimpleCheckOut = async (id, record, penalty) => {
    const row = await WorkSchedule.findOne({ id }, null, options())
        .lean()
        .exec();
    const attendanceRecord =
        record === 'OnTime'
            ? row?.attendanceRecord
            : row?.attendanceRecord
              ? `${row.attendanceRecord}, ${record}`
              : record;
    await WorkSchedule.updateOne(
        { id, status: 'working' },
        {
            $set: {
                status: 'completed',
                checkOutTime: new Date(),
                attendanceRecord
            },
            $inc: { penaltyAmount: penalty }
        },
        options()
    ).exec();
    return true;
};
exports.hasIncompletePreviousShift = async (staffId) => {
    const oldest = new Date(Date.now() + 7 * 3600000 - 7 * 86400000)
        .toISOString()
        .slice(0, 10);
    const row = (await schedulesForStaff(staffId, 'working')).find(
        (row) =>
            row.workDate >= oldest &&
            (row.workDate < today() ||
                vnNow().toISOString().slice(11, 19) > row.shift?.endTime)
    );
    return row
        ? {
              id: row.id,
              workDate: row.workDate,
              shiftName: row.shift?.name || null
          }
        : null;
};
exports.getWorkingScheduleById = async (id, staffId) => {
    const row = await WorkSchedule.findOne(
        { id, staffId, status: 'working' },
        null,
        options()
    )
        .lean()
        .exec();
    if (!row) return null;
    const shift = await Shift.findOne({ id: row.shiftId }, null, options())
        .lean()
        .exec();
    return {
        scheduleId: row.id,
        status: row.status,
        endTime: shift?.endTime?.slice(0, 5) || null,
        roleName: await exports.getStaffRoleName(staffId)
    };
};
exports.autoMarkAbsent = async (staffId) => {
    for (const row of await schedulesForStaff(staffId, 'assigned'))
        if (
            row.workDate < today() ||
            (row.workDate === today() &&
                row.shift?.endTime < vnNow().toISOString().slice(11, 19))
        )
            await WorkSchedule.updateOne(
                { id: row.id, status: 'assigned' },
                { $set: { status: 'absent' } },
                options()
            ).exec();
    return true;
};
exports.autoAssignWarehouse = async (staffId) => {
    const shift = await Shift.findOne(
        { isActive: true, name: /Hành Chính/i },
        null,
        options()
    )
        .sort({ id: 1 })
        .lean()
        .exec();
    if (
        shift &&
        !(await WorkSchedule.exists({ staffId, workDate: today() }).session(
            options().session || null
        ))
    )
        await insert(WorkSchedule, {
            staffId,
            shiftId: shift.id,
            workDate: today(),
            status: 'assigned'
        });
    return true;
};
exports.checkWorking = async (staffId) => {
    const row = (await schedulesForStaff(staffId, 'working')).find(
        (row) => row.workDate === today()
    );
    return row
        ? { id: row.id, endTime: row.shift?.endTime?.slice(0, 5) || null }
        : null;
};
