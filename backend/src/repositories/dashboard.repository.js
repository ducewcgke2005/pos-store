const {
    Staff,
    Category,
    Product,
    InventoryStock,
    Invoice,
    Return,
    Payment,
    Promotion,
    Voucher
} = require('../models');
const { options, clean, sum, today } = require('./helpers');
exports.getSummary = async () => {
    const now = new Date(),
        start = new Date(`${today()}T00:00:00+07:00`),
        week = new Date(now.getTime() - 7 * 86400000),
        month = new Date(now);
    month.setMonth(month.getMonth() - 1);
    const revenue = {};
    for (const [key, since] of [
        ['todayRevenue', start],
        ['weekRevenue', week],
        ['monthRevenue', month]
    ]) {
        const invoices = clean(
            await Invoice.find(
                { status: { $ne: 'CANCELLED' }, createdAt: { $gte: since } },
                'finalAmount',
                options()
            )
                .lean()
                .exec()
        );
        const returns = clean(
            await Return.find(
                { status: 'Approve', createdAt: { $gte: since } },
                'totalRefundAmount',
                options()
            )
                .lean()
                .exec()
        );
        revenue[key] =
            sum(invoices, 'finalAmount') - sum(returns, 'totalRefundAmount');
    }
    const payments = clean(
        await Payment.find(
            { status: 'SUCCESS', createdAt: { $gte: start } },
            null,
            options()
        )
            .lean()
            .exec()
    );
    const vouchers = clean(
        await Voucher.find({}, null, options()).lean().exec()
    );
    const hourly = new Map();
    for (const [Model, filter, field, sign] of [
        [Invoice, { status: { $ne: 'CANCELLED' } }, 'finalAmount', 1],
        [Return, { status: 'Approve' }, 'totalRefundAmount', -1]
    ]) {
        for (const row of clean(
            await Model.find(
                { ...filter, createdAt: { $gte: start } },
                null,
                options()
            )
                .lean()
                .exec()
        )) {
            const time =
                new Date(row.createdAt.getTime() + 7 * 3600000)
                    .toISOString()
                    .slice(11, 13) + ':00';
            hourly.set(time, (hourly.get(time) || 0) + sign * row[field]);
        }
    }
    const count = async (Model, filter = {}) =>
        Model.countDocuments(filter)
            .session(options().session || null)
            .exec();
    return {
        summary: {
            totalStaff: await count(Staff),
            staffOnLeave: await count(Staff, { employmentStatus: 'OnLeave' }),
            totalCategories: await count(Category),
            totalProducts: await count(Product, { status: 'Selling' }),
            totalVouchers: vouchers.filter((row) => row.status === 'Active')
                .length,
            usedVouchers: sum(vouchers, 'currentUsage'),
            totalPromotions: await count(Promotion, { status: 'Active' })
        },
        inventory: {
            lowStock: await count(InventoryStock, {
                $expr: { $lte: ['$quantityOnHand', '$minThreshold'] }
            }),
            newPO: 0,
            newAdjustments: 0
        },
        revenue,
        payments: {
            total: payments.length,
            bank_transfer: sum(
                payments.filter((row) => row.paymentMethod === 'BANK'),
                'amount'
            ),
            cash: sum(
                payments.filter((row) => row.paymentMethod === 'CASH'),
                'amount'
            )
        },
        chartData: hourly.size
            ? [...hourly.entries()]
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([time, amount]) => ({ time, amount }))
            : [
                  { time: '08:00', amount: 0 },
                  { time: '12:00', amount: 0 },
                  { time: '16:00', amount: 0 },
                  { time: '20:00', amount: 0 }
              ]
    };
};
