const { transactional } = require('../infrastructure/transaction');
const attendanceRepository = require("../repositories/attendance.repository");

module.exports.checkPending = async (staffId) => {
    const roleName = await attendanceRepository.getStaffRoleName(staffId);

    if (roleName === 'Manager') return null;
    await attendanceRepository.autoMarkAbsent(staffId);

    if (roleName === 'Warehouse') {
        await attendanceRepository.autoAssignWarehouse(staffId);
    }

    /* Tạm thời bỏ qua chặn bàn giao để User demo
    if (roleName === 'Cashier') {
        const incompleteShift = await attendanceRepository.hasIncompletePreviousShift(staffId);
        if (incompleteShift) {
            const dateStr = new Date(incompleteShift.workDate).toLocaleDateString('vi-VN');
            return {
                blocked: true,
                message: `Bạn chưa bàn giao tiền mặt cho ca: [${incompleteShift.shiftName}] ngày ${dateStr}. Vui lòng kết ca này trước!`
            };
        }
    } */

    const schedule = await attendanceRepository.getPendingSchedule(staffId);
    if (!schedule) return null;

    const needsCash = ['Cashier'].includes(schedule.roleName);
    return { ...schedule, needsCash };
};

module.exports.checkIn = async (staffId, openingCash) => {
    const schedule = await attendanceRepository.getPendingSchedule(staffId);
    if (!schedule) throw new Error('Không tìm thấy ca chờ nhận hôm nay!');

    const role = schedule.roleName;

    // Lấy giờ hiện tại 
    const nowStr = new Date(Date.now() + 7 * 3600 * 1000)
        .toISOString().split('T')[1].substring(0, 5);

    const limitStr = schedule.checkInEnd || schedule.startTime;
    const endStr = schedule.endTime;

    let record = 'OnTime';
    let penalty = 0;

    if (role === 'Cashier' || role === 'Warehouse') {
        if (nowStr >= endStr) {
            throw new Error('Quá giờ kết thúc ca, không thể nhận ca này!');
        }
        if (nowStr > limitStr) {
            record = `LateIn[${nowStr}]`;
            penalty = 10000;
        }
    }

    const needsCash = ['Cashier'].includes(role);
    if (needsCash && openingCash === undefined) {
        throw new Error('Vui lòng đếm két và nhập số tiền đầu ca!');
    }

    await attendanceRepository.processCheckIn(
        schedule.scheduleId,
        openingCash,
        needsCash,
        record,
        penalty
    );
    return { record, penalty, message: 'Nhận ca thành công!' };
};

module.exports.simpleCheckOut = async (staffId, scheduleId) => {
    const schedule = await attendanceRepository.getWorkingScheduleById(scheduleId, staffId);
    if (!schedule) throw new Error("Không tìm thấy ca đang làm của bạn!");
    if (schedule.roleName !== 'Warehouse') {
        throw new Error("Chỉ nhân viên kho mới được dùng chức năng này!");
    }

    const nowStr = new Date(Date.now() + 7 * 3600 * 1000)
        .toISOString().split('T')[1].substring(0, 5);

    let record = 'OnTime';
    let penalty = 0;

    if (nowStr < schedule.endTime) {
        throw new Error("Chưa hết giờ làm, không thể kết ca!");
    }

    await attendanceRepository.processSimpleCheckOut(scheduleId, record, penalty);
    return { record, penalty, message: "Tan ca thành công!" };
};

module.exports.checkWorking = async (staffId) => {
    return await attendanceRepository.checkWorking(staffId);
};

// This service defines the unit of work; repositories share its session.
for (const method of ["checkIn"]) {
    if (typeof module.exports[method] !== 'function') throw new Error('Unknown transaction method: ' + method);
    module.exports[method] = transactional(module.exports[method]);
}
