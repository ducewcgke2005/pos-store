const categoryRepository = require('../repositories/category.repository');

function translateDatabaseError(err) {
    const num = err.number || (err.code === 11000 ? 2627 : err.code);
    const msg = err.message || '';
    if (num === 2627 || num === 2601) {
        if (/name/i.test(msg)) return new Error('Tên danh mục đã tồn tại. Vui lòng dùng tên khác.');
        return new Error('Danh mục bị trùng lặp. Vui lòng kiểm tra lại.');
    }
    if (num === 547) return new Error('Danh mục cha không hợp lệ hoặc không tồn tại.');
    return err;
}

exports.getCategoryList = async (search, page, limit) => {
    const offset = (page - 1) * limit;
    const rows = await categoryRepository.getRootCategories(search, limit, offset);
    const total = await categoryRepository.countRootCategories(search);

    return {
        data: rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
};

exports.getCategoryTree = async (search, page, limit) => {
    const offset = (page - 1) * limit;
    const roots = await categoryRepository.getRootCategories(search, limit, offset);
    const total = await categoryRepository.countRootCategories(search);
    const rootIds = roots.map(r => r.id);
    const descendants = await categoryRepository.getAllDescendants(rootIds);
    const tree = buildTree([...roots, ...descendants]);

    return {
        data: tree,
        pagination: { page, limit, totalRoots: total, totalPages: Math.ceil(total / limit) }
    };
};

exports.getCategoryById = async (id) => {
    const category = await categoryRepository.getCategoryById(id);
    if (!category) throw new Error('Không tìm thấy danh mục.');
    return category;
};

exports.createCategory = async (name, parentId, imageUrl) => {
    if (!name) throw new Error('Tên danh mục không được để trống.');
    if (await categoryRepository.isDuplicateName(name)) {
        throw new Error('Tên danh mục đã tồn tại. Vui lòng dùng tên khác.');
    }
    if (parentId && await categoryRepository.hasProduct(parentId)) {
        throw new Error('Danh mục cha phải là danh mục chưa có sản phẩm nào.');
    }
    try {
        return await categoryRepository.createCategory(name, parentId, imageUrl);
    } catch (err) {
        throw translateDatabaseError(err);
    }
};

exports.updateCategory = async (id, name, parentId, imageUrl) => {
    if (!name) throw new Error('Tên danh mục không được để trống.');
    if (!await categoryRepository.exists(id)) throw new Error('Không tìm thấy danh mục.');
    if (await categoryRepository.isDuplicateName(name, id)) {
        throw new Error('Tên danh mục đã tồn tại. Vui lòng dùng tên khác.');
    }
    if (await categoryRepository.isCircularParent(id, parentId)) {
        throw new Error('Không thể đặt danh mục con làm cha của chính nó.');
    }
    if (parentId && await categoryRepository.hasProduct(parentId)) {
        throw new Error('Danh mục cha phải là danh mục chưa có sản phẩm nào.');
    }
    try {
        await categoryRepository.updateCategory(id, name, parentId, imageUrl);
    } catch (err) {
        throw translateDatabaseError(err);
    }
};

exports.deleteCategory = async (id) => {
    return categoryRepository.deleteCategory(id);
};

exports.getAllCategories = async () => {
    const categories = await categoryRepository.getAllCategories();
    return categories;
};

//build tree + tổng SL sản phẩm
function buildTree(rows) {
    const map = {};
    const roots = [];

    rows.forEach(c => {
        map[c.id] = {
            ...c,
            children: [],
            totalProductCount: c.productCount || 0
        };
    });

    rows.forEach(c => {
        if (c.parentId && map[c.parentId]) {
            map[c.parentId].children.push(map[c.id]);
        } else if (!c.parentId) {
            roots.push(map[c.id]);
        }
    });

    const num = (node) => {
        node.children.forEach(child => {
            num(child);
            node.totalProductCount += child.totalProductCount;
        });
    };

    roots.forEach(num);
    return roots;
}

