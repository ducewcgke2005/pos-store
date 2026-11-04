const { Category, Product } = require('../models');
const {
    options,
    clean,
    insert,
    regex,
    pick,
    ensureReferences
} = require('./helpers');
const withCount = async (rows) => {
    const result = [];
    for (const row of rows)
        result.push({
            ...row,
            imageUrl: row.imageUrl || '',
            productCount: await Product.countDocuments({
                categoryId: row.id,
                status: 'Selling'
            }).session(options().session || null)
        });
    return result;
};
exports.getRootCategories = async (search, limit, offset) =>
    withCount(
        clean(
            await Category.find(
                { status: true, parentId: null, name: regex(search) },
                null,
                options()
            )
                .sort({ name: 1, id: 1 })
                .skip(Number(offset))
                .limit(Number(limit))
                .lean()
                .exec()
        )
    );
exports.countRootCategories = async (search) =>
    Category.countDocuments({
        status: true,
        parentId: null,
        name: regex(search)
    })
        .session(options().session || null)
        .exec();
exports.getDescendantIds = async (rootIds, activeOnly = false) => {
    const found = new Set(rootIds.map(Number));
    let frontier = [...found];
    while (frontier.length) {
        const rows = await Category.find(
            {
                parentId: { $in: frontier },
                ...(activeOnly ? { status: true } : {})
            },
            'id',
            options()
        )
            .lean()
            .exec();
        frontier = rows.map((row) => row.id).filter((id) => !found.has(id));
        frontier.forEach((id) => found.add(id));
    }
    return [...found];
};
exports.getAllDescendants = async (rootIds) => {
    const ids = await exports.getDescendantIds(rootIds, true);
    return withCount(
        clean(
            await Category.find(
                { id: { $in: ids.filter((id) => !rootIds.includes(id)) } },
                null,
                options()
            )
                .sort({ name: 1, id: 1 })
                .lean()
                .exec()
        )
    );
};
exports.countAllCategories = async (search = '') =>
    Category.countDocuments({ status: true, name: regex(search) })
        .session(options().session || null)
        .exec();
exports.getCategoryById = async (id) => {
    const row = clean(
        await Category.findOne({ id, status: true }, null, options())
            .lean()
            .exec()
    );
    return (
        row && {
            ...pick(row, 'id name parentId'),
            imageUrl: row.imageUrl || ''
        }
    );
};
exports.createCategory = async (name, parentId, imageUrl) =>
    (
        await insert(Category, {
            name,
            parentId: parentId || null,
            imageUrl: imageUrl || null,
            status: true
        })
    ).id;
exports.updateCategory = async (id, name, parentId, imageUrl) => {
    const data = {
        name,
        parentId: parentId || null,
        imageUrl: imageUrl || null
    };
    await ensureReferences(Category, data);
    await Category.updateOne({ id }, { $set: data }, options()).exec();
};
exports.deleteCategory = async (id) => {
    if (!(await exports.exists(id))) throw new Error('CATEGORY_NOT_FOUND');
    if (await exports.hasProductInTree(id))
        throw new Error('CATEGORY_HAS_PRODUCT');
    await Category.updateOne(
        { id },
        { $set: { status: false } },
        options()
    ).exec();
};
exports.exists = async (id) =>
    Boolean(
        await Category.exists({ id, status: true }).session(
            options().session || null
        )
    );
exports.hasProductInTree = async (id) =>
    Boolean(
        await Product.exists({
            categoryId: { $in: await exports.getDescendantIds([id], true) },
            status: 'Selling'
        }).session(options().session || null)
    );
exports.isCircularParent = async (id, parentId) =>
    parentId
        ? (await exports.getDescendantIds([id])).includes(Number(parentId))
        : false;
exports.getAllCategories = async () =>
    clean(
        await Category.find(
            { status: true },
            'id name imageUrl parentId -_id',
            options()
        )
            .sort({ name: 1, id: 1 })
            .lean()
            .exec()
    );
exports.hasProduct = async (id) =>
    Boolean(
        await Product.exists({ categoryId: id, status: 'Selling' }).session(
            options().session || null
        )
    );
exports.isDuplicateName = async (name, excludeId = null) =>
    Boolean(
        await Category.exists({
            name,
            status: true,
            ...(excludeId ? { id: { $ne: Number(excludeId) } } : {})
        })
            .collation({ locale: 'vi', strength: 2 })
            .session(options().session || null)
    );
