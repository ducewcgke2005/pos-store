const { transactional } = require('../infrastructure/transaction');
const cashierRepository = require("../repositories/cashier.repository");
const staffRepository = require("../repositories/staff.repository");

module.exports.getMySchedule = async (userId, startDate, endDate) => {
    const staff = await staffRepository.getStaffByUserId(userId);
    if (!staff) throw new Error("Nhân viên không tồn tại!");
    const schedules = await cashierRepository.getMySchedule(staff.id, startDate, endDate);
    return { staff, schedules };
};

module.exports.getPendingShifts = async (userId, workDate) => {
    const staff = await staffRepository.getStaffByUserId(userId);
    if (!staff) throw new Error("Nhân viên không tồn tại!");
    return await cashierRepository.getPendingHandovers(staff.id, workDate);
};

module.exports.getSystemCash = async (userId, scheduleId) => {
    const staff = await staffRepository.getStaffByUserId(userId);
    if (!staff) throw new Error("Nhân viên không tồn tại!");
    return await cashierRepository.getSystemCash(staff.id, scheduleId);
};

module.exports.submitHandover = async (userId, data) => {
    const staff = await staffRepository.getStaffByUserId(userId);
    if (!staff) throw new Error("Nhân viên không tồn tại!");

    const { scheduleId, actualCash, note } = data;
    if (!scheduleId || actualCash === undefined) throw new Error("Thiếu thông tin bàn giao!");

    const systemCash = await cashierRepository.getSystemCash(staff.id, scheduleId);

    return await cashierRepository.createHandoverSimple({
        scheduleId,
        openingCash: data.openingCash || 0,
        systemCash,
        actualCash,
        note,
        updatedRecord: data.updatedRecord || '',
        updatedPenalty: data.updatedPenalty || 0
    });
};

module.exports.getHandoverReport = async (filters) => {
    return await cashierRepository.getHandoverReport(filters);
};

module.exports.getDailyAuditStatus = async (workDate) => {
    return await cashierRepository.getDailyAuditStatus(workDate);
};

// This service defines the unit of work; repositories share its session.
for (const method of ["submitHandover"]) {
    if (typeof module.exports[method] !== 'function') throw new Error('Unknown transaction method: ' + method);
    module.exports[method] = transactional(module.exports[method]);
}
