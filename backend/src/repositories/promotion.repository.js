const {
    Promotion,
    PromotionProduct,
    Product,
    Category,
    Invoice
} = require('../models');
const {
    options,
    clean,
    insert,
    regex,
    pick,
    page,
    sum,
    ensureReferences
} = require('./helpers');
const filterPromotions = ({ search, status, type } = {}) => ({
    ...(search ? { name: regex(search) } : {}),
    ...(status ? { status } : {}),
    ...(type ? { type } : {})
});
exports.getPromotions = async ({ limit = 10, offset = 0, ...filters } = {}) =>
    clean(
        await Promotion.find(filterPromotions(filters), null, options())
            .sort({ createdAt: -1, id: -1 })
            .skip(Number(offset))
            .limit(Number(limit))
            .lean()
            .exec()
    );
exports.countPromotions = async (filters) =>
    Promotion.countDocuments(filterPromotions(filters))
        .session(options().session || null)
        .exec();
exports.getPromotionById = async (id) => {
    const promotion = clean(
        await Promotion.findOne({ id }, null, options()).lean().exec()
    );
    if (!promotion) return null;
    promotion.items = clean(
        await PromotionProduct.find({ promotionId: id }, null, options())
            .sort({ id: 1 })
            .lean()
            .exec()
    );
    for (const item of promotion.items) {
        item.productName =
            (
                await Product.findOne({ id: item.productId }, null, options())
                    .lean()
                    .exec()
            )?.name || null;
        item.categoryName =
            (
                await Category.findOne({ id: item.categoryId }, null, options())
                    .lean()
                    .exec()
            )?.name || null;
    }
    return promotion;
};
exports.createPromotion = async (data) =>
    insert(Promotion, {
        ...pick(data, 'name type value'),
        startDate: data.startDate || null,
        endDate: data.endDate || null,
        status: data.status || 'Active'
    });
exports.updatePromotion = async (id, data) => {
    const fields = Object.fromEntries(
        ['name', 'value', 'startDate', 'endDate', 'status']
            .filter((key) => data[key] !== undefined)
            .map((key) => [key, data[key]])
    );
    if (!Object.keys(fields).length) return null;
    return clean(
        await Promotion.findOneAndUpdate(
            { id },
            { $set: fields },
            { ...options(), new: true }
        )
            .lean()
            .exec()
    );
};
exports.deletePromotion = async (id) =>
    clean(
        await Promotion.findOneAndUpdate(
            { id },
            { $set: { status: 'Disabled' } },
            { ...options(), new: true }
        )
            .lean()
            .exec()
    );
exports.addPromotionItem = async (
    promotionId,
    { productId, categoryId, productUnitId }
) =>
    insert(PromotionProduct, {
        promotionId,
        productId: productId || null,
        categoryId: categoryId || null,
        productUnitId: productUnitId || null
    });
exports.removePromotionItem = async (id) =>
    clean(
        await PromotionProduct.findOneAndDelete({ id }, options()).lean().exec()
    );
exports.clearPromotionItems = async (promotionId) =>
    PromotionProduct.deleteMany({ promotionId }, options()).exec();
const activeFilter = (now) => ({
    status: 'Active',
    $and: [
        { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: null }, { endDate: { $gte: now } }] }
    ]
});
exports.getActivePromotions = async () => {
    const rows = await Promotion.find(activeFilter(new Date()), 'id', options())
        .sort({ startDate: -1, id: -1 })
        .lean()
        .exec();
    const result = [];
    for (const row of rows) {
        const promotion = await exports.getPromotionById(row.id);
        const items = promotion.items.map((item) =>
            pick(item, 'id productId categoryId productName categoryName')
        );
        result.push({ ...promotion, itemsJson: JSON.stringify(items), items });
    }
    return result;
};
exports.getDiscountByProduct = async ({ productId, productUnitId }) => {
    const product = await Product.findOne({ id: productId }, null, options())
        .lean()
        .exec();
    if (!product) return null;
    const matches = [{ productId: Number(productId) }];
    if (productUnitId) matches.push({ productUnitId: Number(productUnitId) });
    if (product.categoryId) matches.push({ categoryId: product.categoryId });
    const links = await PromotionProduct.find({ $or: matches }, null, options())
        .lean()
        .exec();
    const promotions = clean(
        await Promotion.find(
            {
                ...activeFilter(new Date()),
                id: { $in: links.map((row) => row.promotionId) }
            },
            null,
            options()
        )
            .lean()
            .exec()
    );
    const candidates = [];
    for (const link of links) {
        const promotion = promotions.find((row) => row.id === link.promotionId);
        if (promotion)
            candidates.push({
                ...promotion,
                priority:
                    productUnitId &&
                    link.productUnitId === Number(productUnitId)
                        ? 1
                        : link.productId === Number(productId)
                          ? 2
                          : 3
            });
    }
    candidates.sort(
        (a, b) => a.priority - b.priority || b.value - a.value || a.id - b.id
    );
    const row = candidates[0];
    return row
        ? {
              promotionId: row.id,
              promotionName: row.name,
              type: row.type,
              discountPercent: row.type === 'Percent' ? row.value : 0,
              discountAmount: row.type === 'Amount' ? row.value : 0
          }
        : {
              discountPercent: 0,
              discountAmount: 0,
              promotionId: null,
              promotionName: null
          };
};
exports.getPromotionReport = async ({ limit = 20, offset = 0 } = {}) => {
    const rows = clean(await Promotion.find({}, null, options()).lean().exec());
    const result = [];
    for (const row of rows) {
        const invoices = clean(
            await Invoice.find(
                { promotionId: row.id, status: 'PAID' },
                null,
                options()
            )
                .lean()
                .exec()
        );
        result.push({
            ...pick(row, 'id name type value startDate endDate status'),
            timesUsed: invoices.length,
            totalDiscountGiven: sum(invoices, 'promotionDiscount'),
            totalRevenueAfterDiscount: sum(invoices, 'finalAmount')
        });
    }
    return page(
        result.sort((a, b) => b.timesUsed - a.timesUsed || a.id - b.id),
        limit,
        offset
    );
};
exports.countPromotionReport = async () =>
    Promotion.countDocuments({})
        .session(options().session || null)
        .exec();
