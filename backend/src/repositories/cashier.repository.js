const {
    WorkSchedule,
    Shift,
    CashHandover,
    Invoice,
    Payment
} = require('../models');
const {
    options,
    clean,
    pick,
    page,
    sum,
    day,
    ensureReferences
} = require('./helpers');
const staff = require('./staff.repository');
exports.getMySchedule = async (staffId, startDate, endDate) => {
    const rows = await WorkSchedule.find(
        { staffId, workDate: { $gte: day(startDate), $lte: day(endDate) } },
        null,
        options()
    )
        .sort({ workDate: 1, id: 1 })
        .lean()
        .exec();
    const result = [];
    for (const row of rows) {
        const shift = await Shift.findOne({ id: row.shiftId }, null, options())
            .lean()
            .exec();
        const handover = await CashHandover.findOne(
            { scheduleId: row.id },
            null,
            options()
        )
            .lean()
            .exec();
        result.push({
            scheduleId: row.id,
            workDate: row.workDate,
            scheduleStatus: row.status,
            shiftId: shift?.id || null,
            shiftName: shift?.name || null,
            startTime: shift?.startTime?.slice(0, 5) || null,
            endTime: shift?.endTime?.slice(0, 5) || null,
            handoverId: handover?.id || null
        });
    }
    return result.sort(
        (a, b) =>
            a.workDate.localeCompare(b.workDate) ||
            (a.startTime || '').localeCompare(b.startTime || '') ||
            a.scheduleId - b.scheduleId
    );
};
exports.getPendingHandovers = async (staffId, workDate) => {
    const rows = (
        await exports.getMySchedule(staffId, workDate, workDate)
    ).filter((row) => row.scheduleStatus === 'working');
    const result = [];
    for (const row of rows) {
        const handover = clean(
            await CashHandover.findOne(
                { scheduleId: row.scheduleId },
                null,
                options()
            )
                .lean()
                .exec()
        );
        result.push({
            ...pick(row, 'scheduleId shiftName startTime endTime'),
            openingCash: handover?.openingCash || 0
        });
    }
    return result;
};
exports.getScheduleTimes = async (id) => {
    const schedule = await WorkSchedule.findOne({ id }, null, options())
        .lean()
        .exec();
    if (!schedule) return null;
    const shift = await Shift.findOne({ id: schedule.shiftId }, null, options())
        .lean()
        .exec();
    if (!shift) return null;
    return {
        dateStr: schedule.workDate,
        startStr: shift.startTime?.slice(0, 5),
        endStr: shift.endTime?.slice(0, 5),
        deadlineStr: (shift.checkOutDeadline || shift.endTime)?.slice(0, 5),
        attendanceRecord: schedule.attendanceRecord,
        penaltyAmount: clean(schedule.penaltyAmount) || 0
    };
};
exports.getSystemCash = async (staffId, scheduleId) => {
    if (
        !(await WorkSchedule.exists({ id: scheduleId, staffId }).session(
            options().session || null
        ))
    )
        return 0;
    const times = await exports.getScheduleTimes(scheduleId);
    if (!times) return 0;
    const start = new Date(`${times.dateStr}T${times.startStr}:00+07:00`);
    let end = new Date(`${times.dateStr}T${times.endStr}:00+07:00`);
    if (end < start) end = new Date(end.getTime() + 86400000);
    const invoices = await Invoice.find(
        { staffId, createdAt: { $gte: start, $lte: end } },
        'id',
        options()
    )
        .lean()
        .exec();
    const payments = clean(
        await Payment.find(
            {
                invoiceId: { $in: invoices.map((row) => row.id) },
                paymentMethod: 'CASH',
                status: 'SUCCESS'
            },
            'amount',
            options()
        )
            .lean()
            .exec()
    );
    return sum(payments, 'amount');
};
exports.createHandoverSimple = async (data) => {
    await CashHandover.updateOne(
        { scheduleId: data.scheduleId },
        {
            $set: {
                ...pick(data, 'openingCash systemCash actualCash note'),
                handoverTime: new Date()
            }
        },
        options()
    ).exec();
    await WorkSchedule.updateOne(
        { id: data.scheduleId, status: 'working' },
        {
            $set: {
                status: 'completed',
                checkOutTime: new Date(),
                attendanceRecord: data.updatedRecord,
                penaltyAmount: data.updatedPenalty
            }
        },
        options()
    ).exec();
    return true;
};
exports.getHandoverReport = async ({
    fromDate,
    toDate,
    staffId,
    page: currentPage = 1,
    pageSize = 10,
    role,
    staffName,
    shiftName
}) => {
    const handovers = clean(
        await CashHandover.find({}, null, options())
            .sort({ handoverTime: -1, id: -1 })
            .lean()
            .exec()
    );
    const rows = [];
    for (const row of handovers) {
        const schedule = await WorkSchedule.findOne(
            {
                id: row.scheduleId,
                status: 'completed',
                ...(staffId ? { staffId: Number(staffId) } : {})
            },
            null,
            options()
        )
            .lean()
            .exec();
        if (!schedule) continue;
        const employee = await staff.getStaffById(schedule.staffId);
        const shift = await Shift.findOne(
            { id: schedule.shiftId },
            null,
            options()
        )
            .lean()
            .exec();
        const date = new Date(row.handoverTime.getTime() + 7 * 3600000)
            .toISOString()
            .slice(0, 10);
        if (
            (fromDate && date < day(fromDate)) ||
            (toDate && date > day(toDate)) ||
            (role && employee?.roleName !== role) ||
            (staffName &&
                !employee?.fullName
                    ?.toLowerCase()
                    .includes(staffName.toLowerCase())) ||
            (shiftName &&
                !shift?.name?.toLowerCase().includes(shiftName.toLowerCase()))
        )
            continue;
        rows.push({
            handoverId: row.id,
            ...pick(row, 'handoverTime openingCash systemCash actualCash note'),
            difference: row.actualCash - (row.openingCash + row.systemCash),
            staffId: schedule.staffId,
            cashierName: employee?.fullName || null,
            roleName: employee?.roleName || null,
            workDate: new Date(`${schedule.workDate}T00:00:00Z`),
            scheduleId: schedule.id,
            shiftStart: shift?.startTime?.slice(0, 5) || null,
            shiftEnd: shift?.endTime?.slice(0, 5) || null,
            shiftName: shift?.name || null
        });
    }
    return {
        data: page(rows, pageSize, (currentPage - 1) * pageSize),
        total: rows.length,
        summary: {
            totalSessions: rows.length,
            totalSystemCash: sum(rows, 'systemCash'),
            totalActualCash: sum(rows, 'actualCash'),
            totalDifference: sum(rows, 'difference')
        }
    };
};
exports.getDailyAuditStatus = async (workDate) => {
    const employees = (await staff.getAllStaff()).filter(
        (row) => row.roleName === 'Cashier'
    );
    const rows = await WorkSchedule.find(
        {
            workDate: day(workDate),
            staffId: { $in: employees.map((row) => row.id) }
        },
        'status',
        options()
    )
        .lean()
        .exec();
    return {
        totalShifts: rows.length,
        completedShifts: rows.filter((row) => row.status === 'completed')
            .length,
        pendingShifts: rows.filter((row) =>
            ['assigned', 'working'].includes(row.status)
        ).length
    };
};
