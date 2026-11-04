const { transactional } = require('../infrastructure/transaction');
const staffRepository = require("../repositories/staff.repository");
const userRepository = require("../repositories/user.repository");
const bcrypt = require("bcryptjs");

module.exports.getStaffList = async () => {
    return await staffRepository.getAllStaff();
};

module.exports.getRoles = async () => {
    return await staffRepository.getAllRoles();
};

module.exports.getStaffDetail = async (id) => {
    const staff = await staffRepository.getStaffById(id);
    if (!staff) throw new Error("Không tìm thấy nhân viên!");
    return staff;
};

module.exports.toggleStatus = async (id, isActive) => {
    const staff = await staffRepository.getStaffById(id);
    if (!staff) throw new Error("Không tìm thấy nhân viên!");
        await staffRepository.updateStatus(staff.userId, isActive);
    return true;
};

module.exports.resignStaff = async (id) => {
    const staff = await staffRepository.getStaffById(id);
    if (!staff) throw new Error("Không tìm thấy nhân viên!");
    if (staff.employmentStatus === 'resigned') {
        throw new Error("Nhân viên này đã nghỉ việc rồi!");
    }
    
    await staffRepository.atomicResign(id);
    return staff;
}

module.exports.createStaff = async (data) => {
    const { username, email, phoneNumber, fullName, password, roleId } = data;

    if (!username || !fullName || !phoneNumber || !roleId || !password) {
        throw new Error("Vui lòng điền đầy đủ thông tin bắt buộc!");
    }

    const checkUser = await staffRepository.getUserByUsername(username);
    if (checkUser) throw new Error("Tên đăng nhập này đã tồn tại!");

    if (email) {
        const checkEmail = await staffRepository.getStaffByEmail(email);
        if (checkEmail) throw new Error("Email liên lạc này đã được nhân viên khác sử dụng!");
    }

    const checkPhone = await staffRepository.getStaffByPhone(phoneNumber);
    if (checkPhone) throw new Error("Số điện thoại này đã được nhân viên khác sử dụng!");

    const hashedPassword = await bcrypt.hash(password, 10);

    await staffRepository.create({
        ...data,
        email:email || '',
        salaryType:data.salaryType || 'hourly',
        baseSalary:data.baseSalary || 0,
        status:data.isActive || 'active',
        hashedPassword,
        createdAt:data.createdAt || new Date().toISOString()
    });
};

module.exports.updateStaff = async (id, data) => {
    if (data.username) {
        const checkUser = await staffRepository.getStaffByUsernameForUpdate(data.username, id);
        if (checkUser) throw new Error("Tên đăng nhập này đã có chủ, vui lòng chọn tên khác!");
    }

    if (data.phoneNumber) {
        const checkPhone = await staffRepository.getStaffByPhoneForUpdate(data.phoneNumber, id);
        if (checkPhone) throw new Error("Số điện thoại này đã được nhân viên khác sử dụng!");
    }

    if (data.email) {
        const checkEmail = await staffRepository.getStaffByEmailForUpdate(data.email, id);
        if (checkEmail) throw new Error("Email này đã được nhân viên khác sử dụng!");
    }

    let hashedPassword = null;
    if (data.newPassword && data.newPassword.trim() !== "") {
        hashedPassword = await bcrypt.hash(data.newPassword, 10);
    }

    await staffRepository.update(id, {
        ...data,
        email: data.email || '',
        salaryType: data.salaryType || 'hourly',
        baseSalary: data.baseSalary || 0,
        isActive: data.isActive || 'active',
        hashedPassword 
    });
};

module.exports.resetPassword = async (userId) => {
    if (!userId)
         throw new Error
        ("Chưa xác định được Tài khoản nhân viên!");
    
    const defaultHash = await bcrypt.hash("123456", 10);
    await userRepository.changeUserPassword(userId, defaultHash, true);
    return true;
};

module.exports.getMyProfile = async (userId) => {
    const profile = await staffRepository.getStaffByUserId(userId);
    if (!profile) 
        throw new Error
        ("Không tìm thấy thông tin hồ sơ của bạn trên hệ thống!");
    return profile;
};

module.exports.changePassword = async (userId, oldPassword, newPassword) => {
    if (!oldPassword || !newPassword) 
        throw new Error
        ("Vui lòng nhập cả mật khẩu cũ và mới!");
    
    const user = await userRepository.findById(userId);
    const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isMatch) 
        throw new Error
        ("Mật khẩu cũ không chính xác!");
    
    const newHash = await bcrypt.hash(newPassword, 10);
    await userRepository.changeUserPassword(userId, newHash, false);
    return true;
};
// This service defines the unit of work; repositories share its session.
for (const method of ["createStaff","updateStaff","resignStaff"]) {
    if (typeof module.exports[method] !== 'function') throw new Error('Unknown transaction method: ' + method);
    module.exports[method] = transactional(module.exports[method]);
}
