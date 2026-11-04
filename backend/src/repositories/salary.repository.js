const { Payroll, WorkSchedule, Shift } = require('../models');
const { options, clean, insert, day, timeDate } = require('./helpers');
const staff = require('./staff.repository');
exports.getStaffSalaryInfo = async (filter = {}) => {
    const rows = (await staff.getAllStaff()).filter(
        (row) =>
            row.employmentStatus === 'working' &&
            (!filter.staffId || row.id === Number(filter.staffId)) &&
            (!filter.roleName || row.roleName === filter.roleName)
    );
    const result = [];
    for (const row of rows) {
        const employee = await staff.getStaffById(row.id);
        result.push({
            staffId: employee.id,
            fullName: employee.fullName,
            salaryType: employee.salaryType,
            baseSalary: employee.baseSalary,
            roleName: employee.roleName
        });
    }
    return result;
};
exports.getRawWorkSchedules = async (startDate, endDate) => {
    const rows = clean(
        await WorkSchedule.find(
            {
                workDate: { $gte: day(startDate), $lte: day(endDate) },
                status: { $in: ['completed', 'absent'] }
            },
            null,
            options()
        )
            .sort({ workDate: 1, id: 1 })
            .lean()
            .exec()
    );
    const result = [];
    for (const row of rows) {
        const shift = await Shift.findOne({ id: row.shiftId }, null, options())
            .lean()
            .exec();
        result.push({
            staffId: row.staffId,
            workDate: new Date(`${row.workDate}T00:00:00Z`),
            status: row.status,
            penaltyAmount: row.penaltyAmount,
            attendanceRecord: row.attendanceRecord,
            shiftName: shift?.name || null,
            startTime: timeDate(shift?.startTime),
            endTime: timeDate(shift?.endTime)
        });
    }
    return result;
};
exports.getConfirmedPayrolls = async (month, year, filter = {}) => {
    const rows = clean(
        await Payroll.find(
            {
                month,
                year,
                ...(filter.staffId ? { staffId: Number(filter.staffId) } : {})
            },
            null,
            options()
        )
            .sort({ id: 1 })
            .lean()
            .exec()
    );
    const result = [];
    for (const row of rows) {
        const employee = await staff.getStaffById(row.staffId);
        if (
            employee &&
            (!filter.roleName || employee.roleName === filter.roleName)
        )
            result.push({
                ...row,
                fullName: employee.fullName,
                roleName: employee.roleName
            });
    }
    return result;
};
exports.getRoleList = async () => [
    ...new Set(
        (await staff.getAllStaff())
            .filter((row) => row.employmentStatus === 'working')
            .map((row) => row.roleName)
            .filter(Boolean)
    )
];
exports.getPayrollStatus = async (month, year) => ({
    isPaid: Boolean(
        await Payroll.exists({ month, year, status: 'paid' }).session(
            options().session || null
        )
    )
});
exports.savePayroll = async ({
    staffId,
    month,
    year,
    baseSalary,
    salaryType,
    workUnit,
    gross,
    deductions,
    net,
    note
}) => {
    const data = {
        staffId,
        month,
        year,
        appliedBaseSalary: baseSalary,
        appliedSalaryType: salaryType,
        totalWorkUnit: workUnit,
        provisionalSalary: gross,
        deductions,
        finalAmount: net,
        note,
        status: 'paid',
        createdAt: new Date()
    };
    const existing = await Payroll.findOne(
        { staffId, month, year },
        'id',
        options()
    )
        .lean()
        .exec();
    if (existing)
        await Payroll.updateOne(
            { id: existing.id },
            { $set: data },
            options()
        ).exec();
    else await insert(Payroll, data);
};
