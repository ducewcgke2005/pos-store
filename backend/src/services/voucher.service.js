const VALID_TYPES = ['Percent', 'Fixed'];
const VALID_STATUSES = ['Active', 'Expired', 'Disabled'];

const validateFields = (data, isUpdate = false) => {
    const { code, type, status, value, minOrderValue, maxUsage, startDate, expiryDate } = data;

    // 1. Kiểm tra mã voucher (chỉ khi tạo mới hoặc nếu có truyền vào khi update)
    if (!isUpdate || (code !== undefined)) {
        if (code === undefined || code === null || String(code).trim() === '') {
            throw new Error('Mã voucher không được để trống');
        }
    }

    // 2. Kiểm tra các số (không được âm)
    if (value !== undefined && parseFloat(value) < 0) {
        throw new Error('Giá trị giảm của voucher không được là số âm');
    }

    if (minOrderValue !== undefined && parseFloat(minOrderValue) < 0) {
        throw new Error('Giá trị đơn hàng tối thiểu không được là số âm');
    }

    if (maxUsage !== undefined && parseInt(maxUsage) < 0) {
        throw new Error('Số lượt sử dụng tối đa không được là số âm');
    }

    // 3. Kiểm tra ngày (không được ở quá khứ)
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Chỉ so sánh ngày, không cần giờ phút giây

    /*
    if (startDate) {
        if (isNaN(Date.parse(startDate))) {
            throw new Error('Ngày bắt đầu không đúng định dạng');
        }
        if (!isUpdate) {
            const start = new Date(startDate);
            if (start < now) {
                throw new Error('Ngày bắt đầu không được ở trong quá khứ');
            }
        }
    }

    if (expiryDate) {
        if (isNaN(Date.parse(expiryDate))) {
            throw new Error('Ngày hết hạn không đúng định dạng');
        }
        const end = new Date(expiryDate);
        if (end < now) {
            throw new Error('Ngày hết hạn không được ở trong quá khứ');
        }
    }
    */

    // 4. Logic so sánh ngày
    if (startDate && expiryDate && !isNaN(Date.parse(startDate)) && !isNaN(Date.parse(expiryDate))) {
        const start = new Date(startDate);
        const end = new Date(expiryDate);
        if (start > end) {
            throw new Error('Ngày bắt đầu không được lớn hơn ngày hết hạn');
        }
    }

    // 5. Validate ENUMs
    if (type !== undefined && !VALID_TYPES.includes(type)) {
        throw new Error(`Kiểu voucher không hợp lệ. Chỉ chấp nhận: ${VALID_TYPES.join(', ')}`);
    }
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
        throw new Error(`Trạng thái không hợp lệ. Chỉ chấp nhận: ${VALID_STATUSES.join(', ')}`);
    }
};


const voucherRepository = require('../repositories/voucher.repository');

exports.getVoucherList = async (filters) => {
    const [data, total] = await Promise.all([
        voucherRepository.getVouchers(filters),
        voucherRepository.countVouchers(filters)
    ]);
    return { data, total, totalPages: Math.ceil(total / (filters.limit || 10)) };
};

exports.getVoucherByCode = async (code, orderValue = 0) => {
    if (!code) {
        throw new Error("Mã giảm giá không được để trống");
    }

    const voucher = await voucherRepository.getVoucherByCode(code);

    if (!voucher) {
        throw new Error("Mã giảm giá không tồn tại");
    }

    if (voucher.status !== 'Active') {
        throw new Error("Mã giảm giá hiện không khả dụng hoặc đã bị vô hiệu hóa");
    }

    const now = new Date();
    if (voucher.startDate && now < new Date(voucher.startDate)) {
        throw new Error("Chương trình giảm giá chưa bắt đầu");
    }
    if (voucher.expiryDate && now > new Date(voucher.expiryDate)) {
        throw new Error("Mã giảm giá đã hết hạn sử dụng");
    }

    if (voucher.maxUsage !== null && voucher.currentUsage >= voucher.maxUsage) {
        throw new Error("Mã giảm giá đã hết lượt sử dụng");
    }
    if (Number(orderValue) < Number(voucher.minOrderValue)) {
        throw new Error(`Đơn hàng tối thiểu phải từ ${new Intl.NumberFormat('vi-VN').format(voucher.minOrderValue)}đ để áp dụng mã này`);
    }

    return voucher;
};

exports.getVoucherById = async (id) => {
    return await voucherRepository.getVoucherById(id);
};

exports.createVoucher = async (data) => {
    validateFields(data, false);
    return await voucherRepository.createVoucher(data);
};

exports.updateVoucher = async (id, data) => {
    const current = await voucherRepository.getVoucherById(id);
    if (!current) return null;
    validateFields({ ...current, ...data }, true);
    return await voucherRepository.updateVoucher(id, data);
};

exports.deleteVoucher = async (id) => {
    return await voucherRepository.deleteVoucher(id);
};

/**
 * Validate voucher — UC8: Validate & Apply Voucher
 * Cashier gọi API này trước khi áp dụng vào hóa đơn
 */
exports.validateVoucher = async (code, orderAmount = 0) => {
    if (!code) throw new Error('Mã voucher không được để trống');
    const voucher = await voucherRepository.getVoucherByCode(code.trim().toUpperCase());
    if (!voucher) {
        return { valid: false, voucher: null, discountAmount: 0, message: 'Mã voucher không tồn tại' };
    }
    if (voucher.status !== 'Active') {
        return { valid: false, voucher, discountAmount: 0, message: 'Voucher đã bị vô hiệu hóa hoặc hết hạn' };
    }

    const now = new Date();
    if (voucher.startDate && new Date(voucher.startDate) > now) {
        return { valid: false, voucher, discountAmount: 0, message: 'Voucher chưa đến thời gian sử dụng' };
    }
    if (voucher.expiryDate && new Date(voucher.expiryDate) < now) {
        return { valid: false, voucher, discountAmount: 0, message: 'Voucher đã hết hạn sử dụng' };
    }
    if (voucher.currentUsage >= voucher.maxUsage) {
        return { valid: false, voucher, discountAmount: 0, message: 'Voucher đã hết lượt sử dụng' };
    }
    if (parseFloat(orderAmount) < parseFloat(voucher.minOrderValue)) {
        return {
            valid: false,
            voucher,
            discountAmount: 0,
            message: `Đơn hàng tối thiểu ${voucher.minOrderValue.toLocaleString()} đ để dùng voucher này`
        };
    }

    // Tính tiền được giảm
    let discountAmount = 0;
    if (voucher.type === 'Percent') {
        discountAmount = parseFloat(orderAmount) * parseFloat(voucher.value) / 100;
    } else {
        // Fixed
        discountAmount = Math.min(parseFloat(voucher.value), parseFloat(orderAmount));
    }

    return { valid: true, voucher, discountAmount: parseFloat(discountAmount.toFixed(2)), message: 'Voucher hợp lệ' };
};

/**
 * Báo cáo hiệu quả voucher — UC10: View Voucher Usage Reports
 */
exports.getVoucherReport = async ({ page = 1, limit = 20 } = {}) => {
    const pageNum = Math.max(parseInt(page), 1);
    const pageSize = Math.max(parseInt(limit), 1);
    const offset = (pageNum - 1) * pageSize;

    const [data, total] = await Promise.all([
        voucherRepository.getVoucherReport({ limit: pageSize, offset }),
        voucherRepository.countVoucherReport()
    ]);

    return {
        data,
        total,
        page: pageNum,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize)
    };
};
