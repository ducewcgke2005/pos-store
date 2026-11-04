const { Category, Product, InventoryStock } = require('../models');
const { options, clean, regex } = require('./helpers');
exports.getCategoryStock = async (search, limit, offset) => {
    const categories = clean(
        await Category.find({ name: regex(search) }, null, options())
            .sort({ name: 1, id: 1 })
            .skip(Number(offset))
            .limit(Number(limit))
            .lean()
            .exec()
    );
    const result = [];
    for (const category of categories) {
        const products = await Product.find(
            { categoryId: category.id },
            'id',
            options()
        )
            .lean()
            .exec();
        const stocks = clean(
            await InventoryStock.find(
                { productId: { $in: products.map((row) => row.id) } },
                'quantityOnHand',
                options()
            )
                .lean()
                .exec()
        );
        result.push({
            categoryId: category.id,
            categoryName: category.name,
            imageUrl: category.imageUrl,
            totalProducts: products.length,
            totalStock: stocks.reduce((sum, row) => sum + row.quantityOnHand, 0)
        });
    }
    return result;
};
exports.countCategories = async (search) =>
    Category.countDocuments({ name: regex(search) })
        .session(options().session || null)
        .exec();
