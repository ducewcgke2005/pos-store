const validateFields = (data) => {
    const { loyaltyPoints, totalSpending } = data;

    if (loyaltyPoints !== undefined && parseInt(loyaltyPoints) < 0) {
        throw new Error('Điểm tích lũy không được là số âm');
    }

    if (totalSpending !== undefined && parseFloat(totalSpending) < 0) {
        throw new Error('Tổng chi tiêu không được là số âm');
    }
};


const customerRepository = require('../repositories/customer.repository');

exports.getCustomerList = async (filters) => {
    const [data, total] = await Promise.all([
        customerRepository.getCustomers(filters),
        customerRepository.countCustomers(filters)
    ]);
    return {
        data,
        total,
        totalPages: Math.ceil(total / filters.limit)
    };
};

exports.getCustomerById = async (id) => {
    return await customerRepository.getCustomerById(id);
};

exports.createCustomer = async (data) => {
    validateFields(data);
    let { name, phone } = data;

    name = name?.trim();
    phone = phone?.trim();

    if (!name) {
        throw new Error("Tên khách hàng không được để trống");
    }

    if (name.length < 2 || name.length > 50) {
        throw new Error("Tên khách hàng phải từ 2 đến 50 ký tự");
    }

    const nameRegex = /^[a-zA-ZÀ-ỹ\s]+$/;
    if (!nameRegex.test(name)) {
        throw new Error("Tên khách hàng không được chứa số hoặc ký tự đặc biệt");
    }

    if (!phone) {
        throw new Error("Số điện thoại không được để trống");
    }

    if (phone.startsWith("+84")) {
        phone = "0" + phone.slice(3);
    }

    const phoneRegex = /^0[0-9]{9}$/;
    if (!phoneRegex.test(phone)) {
        throw new Error("Số điện thoại không hợp lệ");
    }

    const existed = await customerRepository.getCustomerByPhone(phone);
    if (existed) {
        throw new Error("Số điện thoại đã tồn tại");
    }

    data.name = name;
    data.phone = phone;

    return await customerRepository.createCustomer(data);
};

exports.updateCustomer = async (id, data) => {
    validateFields(data);
    return await customerRepository.updateCustomer(id, data);
};

exports.deleteCustomer = async (id) => {
    return await customerRepository.deleteCustomer(id);
};

/** Tìm chính xác 1 khách theo số điện thoại — dùng tại quầy thu ngân */
exports.getCustomerByPhone = async (phone) => {
    if (!phone) throw new Error('Số điện thoại không được để trống');
    return await customerRepository.getCustomerByPhone(phone.trim());
};

/** Tìm kiếm khách theo số điện thoại (LIKE) — trả về tối đa 10 kết quả */
exports.searchCustomersByPhone = async (phone) => {
    if (!phone) throw new Error('Số điện thoại không được để trống');
    return await customerRepository.searchCustomersByPhone(phone.trim());
};

/**
 * Lịch sử mua hàng của khách — UC3: View Purchase History
 */
exports.getPurchaseHistory = async (customerId, { page = 1, limit = 10 } = {}) => {
    const pageNum = Math.max(parseInt(page), 1);
    const pageSize = Math.max(parseInt(limit), 1);
    const offset = (pageNum - 1) * pageSize;

    const [data, total] = await Promise.all([
        customerRepository.getPurchaseHistory(customerId, { limit: pageSize, offset }),
        customerRepository.countPurchaseHistory(customerId)
    ]);

    return {
        data,
        total,
        page: pageNum,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize)
    };
};
