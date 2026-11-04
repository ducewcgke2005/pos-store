const {
    PurchaseOrder,
    PurchaseOrderItem,
    ProductUnit,
    Product,
    Supplier
} = require('../models');
const { options, clean } = require('./helpers');
exports.getMonthlyReport = async ({ month, year, supplierId }) => {
    const start = new Date(
        `${year}-${String(month).padStart(2, '0')}-01T00:00:00+07:00`
    );
    const end = new Date(
        Date.UTC(Number(year), Number(month), 1) - 7 * 3600000
    );
    const orders = clean(
        await PurchaseOrder.find(
            {
                status: { $in: ['Received', 'PartiallyReceived'] },
                createdAt: { $gte: start, $lt: end },
                ...(supplierId ? { supplierId } : {})
            },
            null,
            options()
        )
            .lean()
            .exec()
    );
    const supplierMap = new Map(),
        dayMap = new Map(),
        productMap = new Map();
    const summary = {
        totalPO: 0,
        totalQuantityOrdered: 0,
        totalQuantityReceived: 0,
        totalSuppliers: 0,
        totalProducts: 0,
        totalAmount: 0,
        avgPOValue: 0
    };
    const orderIds = new Set(),
        supplierIds = new Set(),
        productIds = new Set();
    let weightedOrderTotal = 0,
        lineCount = 0;
    for (const order of orders) {
        const items = clean(
            await PurchaseOrderItem.find({ poId: order.id }, null, options())
                .lean()
                .exec()
        );
        const supplier = await Supplier.findOne(
            { id: order.supplierId },
            null,
            options()
        )
            .lean()
            .exec();
        for (const item of items) {
            const unit = await ProductUnit.findOne(
                { id: item.productUnitId },
                null,
                options()
            )
                .lean()
                .exec();
            if (!unit) continue;
            const product = await Product.findOne(
                { id: unit.productId },
                null,
                options()
            )
                .lean()
                .exec();
            const amount = item.receivedQuantity * item.costPrice;
            orderIds.add(order.id);
            supplierIds.add(order.supplierId);
            productIds.add(unit.productId);
            summary.totalQuantityOrdered += item.quantity;
            summary.totalQuantityReceived += item.receivedQuantity;
            summary.totalAmount += amount;
            weightedOrderTotal += order.totalAmount;
            lineCount++;
            if (supplier) {
                const stats = supplierMap.get(supplier.id) || {
                    id: supplier.id,
                    name: supplier.name,
                    totalPO: 0,
                    totalQuantity: 0,
                    totalAmount: 0,
                    ids: new Set()
                };
                stats.ids.add(order.id);
                stats.totalQuantity += item.receivedQuantity;
                stats.totalAmount += amount;
                supplierMap.set(supplier.id, stats);
            }
            const day = new Date(
                order.createdAt.getTime() + 7 * 3600000
            ).getUTCDate();
            const stats = dayMap.get(day) || {
                day,
                totalQuantity: 0,
                totalAmount: 0,
                totalPO: 0,
                ids: new Set()
            };
            stats.ids.add(order.id);
            stats.totalQuantity += item.receivedQuantity;
            stats.totalAmount += amount;
            dayMap.set(day, stats);
            if (product) {
                const p = productMap.get(product.id) || {
                    id: product.id,
                    name: product.name,
                    totalQuantity: 0,
                    totalAmount: 0
                };
                p.totalQuantity += item.receivedQuantity;
                p.totalAmount += amount;
                productMap.set(product.id, p);
            }
        }
    }
    Object.assign(summary, {
        totalPO: orderIds.size,
        totalSuppliers: supplierIds.size,
        totalProducts: productIds.size,
        avgPOValue: lineCount ? weightedOrderTotal / lineCount : 0
    });
    const countIds = ({ ids, ...row }) => ({ ...row, totalPO: ids.size });
    return {
        filter: { month, year, supplierId },
        summary,
        supplierStats: [...supplierMap.values()]
            .map(countIds)
            .sort((a, b) => b.totalAmount - a.totalAmount || a.id - b.id),
        dailyStats: [...dayMap.values()]
            .map(countIds)
            .sort((a, b) => a.day - b.day),
        topProducts: [...productMap.values()]
            .sort((a, b) => b.totalQuantity - a.totalQuantity || a.id - b.id)
            .slice(0, 5)
    };
};
