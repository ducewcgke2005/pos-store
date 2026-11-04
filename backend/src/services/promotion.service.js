const VALID_TYPES = ['Percent', 'Amount', 'BuyXGetY'];
const VALID_STATUSES = ['Active', 'Expired', 'Disabled'];

// ─── HELPERS ────────────────────────────────────────────────────────────────

/**
 * Validate type và status theo đúng CHECK CONSTRAINT của DB.
 * Ném lỗi rõ ràng thay vì để SQL Server trả về lỗi khó đọc.
 */
const validateFields = (data) => {
    const { type, status, value, startDate, endDate } = data;

    if (type !== undefined && !VALID_TYPES.includes(type)) {
        throw new Error(`type không hợp lệ. Chỉ chấp nhận: ${VALID_TYPES.join(', ')}`);
    }
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
        throw new Error(`status không hợp lệ. Chỉ chấp nhận: ${VALID_STATUSES.join(', ')}`);
    }

    if (value !== undefined && parseFloat(value) < 0) {
        throw new Error('Giá trị khuyến mãi không được là số âm');
    }

    if (startDate && isNaN(Date.parse(startDate))) {
        throw new Error('Ngày bắt đầu không hợp lệ');
    }

    if (endDate && isNaN(Date.parse(endDate))) {
        throw new Error('Ngày kết thúc không hợp lệ');
    }

    if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (start > end) {
            throw new Error('Ngày bắt đầu không được lớn hơn ngày kết thúc');
        }
    }
};

// ─── PROMOTIONS ─────────────────────────────────────────────────────────────


const { transactional } = require('../infrastructure/transaction');
const promotionRepository = require('../repositories/promotion.repository');

exports.getPromotionList = async (filters) => {
    const [data, total] = await Promise.all([
        promotionRepository.getPromotions(filters),
        promotionRepository.countPromotions(filters)
    ]);
    return {
        data,
        total,
        totalPages: Math.ceil(total / (filters.limit || 10))
    };
};

exports.getPromotionById = async (id) => {
    return await promotionRepository.getPromotionById(id);
};

exports.createPromotion = async (data) => {
    validateFields(data);
    const promotion = await promotionRepository.createPromotion(data);
    if (data.items && data.items.length > 0) {
        for (const item of data.items) {
            validatePromotionItem(item);
            await promotionRepository.addPromotionItem(promotion.id, item);
        }
    }
    return await promotionRepository.getPromotionById(promotion.id);
};

exports.updatePromotion = async (id, data) => {
    const current = await promotionRepository.getPromotionById(id);
    if (!current) return null;
    validateFields({ ...current, ...data });
    const updated = await promotionRepository.updatePromotion(id, data);
    if (!updated) return null;
    if (data.items !== undefined) {
        await promotionRepository.clearPromotionItems(id);
        for (const item of data.items) {
            validatePromotionItem(item);
            await promotionRepository.addPromotionItem(id, item);
        }
    }
    return await promotionRepository.getPromotionById(id);
};

exports.deletePromotion = async (id) => {
    return await promotionRepository.deletePromotion(id);
};

exports.removePromotionItem = async (itemId) => {
    return await promotionRepository.removePromotionItem(itemId);
};

/** Thêm item vào promotion có sẵn — UC6: Assign Products to Promotion */
exports.addPromotionItem = async (promotionId, item) => {
    const promotion = await promotionRepository.getPromotionById(promotionId);
    if (!promotion) throw new Error('Không tìm thấy promotion');
    validatePromotionItem(item);
    await promotionRepository.addPromotionItem(promotionId, item);
    return await promotionRepository.getPromotionById(promotionId);
};

/**
 * Danh sách promotion đang hiệu lực — UC8: cashier áp dụng khi bán hàng
 */
exports.getActivePromotions = async () => {
    return await promotionRepository.getActivePromotions();
};

/**
 * Báo cáo hiệu quả khuyến mãi — UC9: View Promotion Reports
 */
exports.getPromotionReport = async ({ page = 1, limit = 20 } = {}) => {
    const pageNum = Math.max(parseInt(page), 1);
    const pageSize = Math.max(parseInt(limit), 1);
    const offset = (pageNum - 1) * pageSize;

    const [data, total] = await Promise.all([
        promotionRepository.getPromotionReport({ limit: pageSize, offset }),
        promotionRepository.countPromotionReport()
    ]);

    return {
        data,
        total,
        page: pageNum,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize)
    };
};

/**
 * Tìm giảm giá áp dụng cho sản phẩm theo productId và productUnitId.
 * Trả về: { discountPercent, discountAmount, promotionId, promotionName, type }
 */
exports.getDiscountByProduct = async ({ productId, productUnitId }) => {
    if (!productId) throw new Error('productId là bắt buộc');
    return await promotionRepository.getDiscountByProduct({ productId, productUnitId });
};

// This service defines the unit of work; repositories share its session.
for (const method of ["createPromotion","updatePromotion","addPromotionItem"]) {
    if (typeof module.exports[method] !== 'function') throw new Error('Unknown transaction method: ' + method);
    module.exports[method] = transactional(module.exports[method]);
}

function validatePromotionItem({ productId, categoryId, productUnitId }) {
    if (!productId && !categoryId && !productUnitId) throw new Error('Phải cung cấp ít nhất productId, categoryId hoặc productUnitId');
}
