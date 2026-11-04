const bcrypt = require('bcrypt');
const fixtures = require('../config/demo-seed');
const demoRepository = require('../repositories/demoSeed.repository');
const seedRepository = require('../repositories/seed.repository');
const stockRepository = require('../repositories/productStock.repository');
const comboRepository = require('../repositories/product/productCombo.repository');
const { runInTransaction } = require('../infrastructure/transaction');

const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const roundQuantity = (value) =>
    Math.round((value + Number.EPSILON) * 1000) / 1000;
const barcode = (index, variant = 0) => {
    const stem = `290${String(index).padStart(8, '0')}${variant}`;
    const sum = [...stem].reduce(
        (total, digit, position) =>
            total + Number(digit) * (position % 2 ? 3 : 1),
        0
    );
    return stem + ((10 - (sum % 10)) % 10);
};
const dateHelpers = (now) => {
    const local = new Date(now.getTime() + 7 * 3600000);
    const at = (daysAgo, hour = 10, minute = 0) =>
        new Date(
            Date.UTC(
                local.getUTCFullYear(),
                local.getUTCMonth(),
                local.getUTCDate() - daysAgo,
                hour,
                minute
            ) -
                7 * 3600000
        );
    const day = (daysAgo) =>
        new Date(at(daysAgo).getTime() + 7 * 3600000)
            .toISOString()
            .slice(0, 10);
    return { at, day, local };
};

exports.seedDemo = async (password, { now = new Date() } = {}) => {
    if (!password)
        throw new Error('SEED_PASSWORD is required for demo accounts');
    if (!Number.isFinite(now.getTime()))
        throw new Error('Invalid demo seed date');
    const passwordHash = await bcrypt.hash(password, 10);
    return runInTransaction(async () => {
        const previous = await demoRepository.claimBatch(
            fixtures.batchKey,
            now
        );
        if (previous?.state === 'completed')
            return {
                alreadySeeded: true,
                normalizedInvoices:
                    await demoRepository.normalizePendingDemoInvoices(),
                counts: previous.counts,
                completedAt: previous.completedAt
            };
        if (previous)
            throw new Error(
                'Demo batch is incomplete; inspect seedRuns before retrying'
            );
        const counts = {};
        const count = (key, amount = 1) => {
            counts[key] = (counts[key] || 0) + amount;
        };
        const { at, day, local } = dateHelpers(now);
        await seedRepository.seedDevelopment(passwordHash);
        const foundation = await demoRepository.getFoundation();
        const admin = foundation.staff[0];
        const cashiers = [foundation.staff[1]];
        const warehouse = [foundation.staff[2]];
        const employees = [];
        for (const [
            index,
            [username, fullName, roleName, salaryType, baseSalary]
        ] of fixtures.employees.entries()) {
            const role = foundation.roles.find((row) => row.name === roleName);
            const staff = await demoRepository.createEmployee(
                {
                    username,
                    roleId: role.id,
                    passwordHash,
                    isActive: 'active',
                    requirePasswordChange: false,
                    createdAt: at(65)
                },
                {
                    fullName,
                    phoneNumber: `089${String(1000000 + index)}`,
                    email: username,
                    salaryType,
                    baseSalary,
                    employmentStatus: 'working',
                    createdAt: at(65)
                }
            );
            const employee = { ...staff, roleName, username };
            employees.push(employee);
            (roleName === 'Cashier' ? cashiers : warehouse).push(employee);
            count('staff');
        }
        const counters = [foundation.counter];
        for (let index = 2; index <= 3; index++)
            counters.push(
                await demoRepository.createCounter({
                    counterCode: `DEMO-COUNTER-${index}`,
                    counterName: `Quầy ${index} (Demo)`,
                    status: 'ACTIVE'
                })
            );

        const categories = {};
        for (const root of fixtures.roots) {
            categories[root.key] = await demoRepository.createCategory({
                name: root.name,
                parentId: null,
                status: true
            });
            count('categories');
        }
        for (const group of fixtures.groups) {
            categories[group.key] = await demoRepository.createCategory({
                name: group.name,
                parentId: categories[group.parent].id,
                status: true
            });
            count('categories');
        }
        const suppliers = [];
        for (const [index, [name, address]] of fixtures.suppliers.entries()) {
            suppliers.push(
                await demoRepository.createSupplier({
                    name,
                    address,
                    contactInfo: `070100000${index} · sales${index + 1}@localstore-demo.example`
                })
            );
            count('suppliers');
        }

        const products = [];
        for (const group of fixtures.groups)
            for (const [name, salePrice] of group.items) {
                const index = products.length;
                const weighted = group.key === 'fresh';
                const product = await demoRepository.createProduct(
                    {
                        code: `DEMO-P${String(index + 1).padStart(3, '0')}`,
                        name,
                        categoryId: categories[group.key].id,
                        baseUnit: group.unit,
                        allowDecimalQuantity: weighted,
                        isCombo: false,
                        status:
                            index === 43
                                ? 'Suspended'
                                : index === 46
                                  ? 'StopSelling'
                                  : 'Selling',
                        createdAt: at(60)
                    },
                    {
                        unitName: group.unit,
                        conversionFactor: 1,
                        salePrice,
                        barcode: barcode(index + 1),
                        unitType: weighted ? 'WEIGHT' : 'PIECE'
                    },
                    admin.id
                );
                if (!weighted) {
                    product.units.push(
                        await demoRepository.createUnit(
                            {
                                productId: product.id,
                                unitName: group.pack,
                                conversionFactor: group.factor,
                                salePrice: round(
                                    salePrice * group.factor * 0.95
                                ),
                                barcode: barcode(index + 1, 1),
                                unitType: 'PIECE'
                            },
                            admin.id,
                            at(60)
                        )
                    );
                }
                product.group = group.key;
                product.stock = 0;
                product.openingStock =
                    index === 47 || index === 46
                        ? 0
                        : index >= 40 && index !== 42
                          ? 1 + (index % 6)
                          : weighted
                            ? 120
                            : 300 + (index % 5) * 50;
                product.costPrice = Math.round((salePrice * 0.62) / 100) * 100;
                product.supplier = suppliers[index % suppliers.length];
                await demoRepository.linkSupplier(
                    product.supplier.id,
                    product,
                    product.units.map((unit) =>
                        round(product.costPrice * unit.conversionFactor)
                    ),
                    admin.userId,
                    at(60)
                );
                products.push(product);
                count('products');
                count('productUnits', product.units.length);
            }

        // Opening stock comes from received purchase orders, not unexplained stock resets.
        for (const [index, supplier] of suppliers.entries()) {
            const supplied = products.filter(
                (product) => product.supplier.id === supplier.id
            );
            const items = supplied.map((product) => ({
                productUnitId: product.units[0].id,
                quantity: product.openingStock || 20,
                receivedQuantity: product.openingStock,
                costPrice: product.costPrice,
                note: 'DEMO: nhập kho ban đầu'
            }));
            await demoRepository.createPurchaseOrder(
                {
                    createdBy: warehouse[0].id,
                    processBy: admin.id,
                    receivedBy: warehouse[index % warehouse.length].id,
                    supplierId: supplier.id,
                    status: items.every(
                        (item) => item.quantity === item.receivedQuantity
                    )
                        ? 'Received'
                        : 'PartiallyReceived',
                    totalAmount: round(
                        items.reduce(
                            (total, item) =>
                                total + item.receivedQuantity * item.costPrice,
                            0
                        )
                    ),
                    createdAt: at(45 + index),
                    note: 'DEMO: phiếu nhập hàng đã nhận'
                },
                items
            );
            for (const product of supplied)
                if (product.openingStock > 0) {
                    await stockRepository.addStock(
                        null,
                        product.id,
                        product.openingStock
                    );
                    product.stock += product.openingStock;
                }
            count('purchaseOrders');
            const status = [
                'Pending',
                'Approved',
                'WaitingForDelivery',
                'Rejected',
                'CannotDeliver',
                'Draft'
            ][index];
            const planned = supplied.slice(0, 2).map((product) => ({
                productUnitId: product.units[0].id,
                quantity: 30,
                receivedQuantity: 0,
                costPrice: product.costPrice
            }));
            await demoRepository.createPurchaseOrder(
                {
                    createdBy: warehouse[0].id,
                    supplierId: supplier.id,
                    status,
                    processBy:
                        status === 'Pending' || status === 'Draft'
                            ? null
                            : admin.id,
                    totalAmount: ['Rejected', 'CannotDeliver'].includes(status)
                        ? 0
                        : planned.reduce(
                              (total, item) =>
                                  total + item.quantity * item.costPrice,
                              0
                          ),
                    createdAt: at(index + 1),
                    note: 'DEMO: đơn bổ sung đang xử lý'
                },
                planned
            );
            count('purchaseOrders');
        }

        for (const [index, recipe] of [
            [products[6], products[18]],
            [products[30], products[36]]
        ].entries()) {
            const product = await demoRepository.createProduct(
                {
                    code: `DEMO-C${index + 1}`,
                    name: ['Combo bữa phụ tiện lợi', 'Combo chăm sóc gia đình'][
                        index
                    ],
                    categoryId: categories[index ? 'home' : 'snack'].id,
                    baseUnit: 'Bộ',
                    allowDecimalQuantity: false,
                    isCombo: true,
                    status: 'Selling',
                    createdAt: at(35)
                },
                {
                    unitName: 'Bộ',
                    conversionFactor: 1,
                    salePrice: [24000, 59000][index],
                    barcode: barcode(49 + index),
                    unitType: 'PIECE'
                },
                admin.id
            );
            for (const child of recipe) {
                await comboRepository.addComboItem(product.id, {
                    childProductId: child.id,
                    quantity: 1
                });
                if (
                    !(await stockRepository.decreaseStockIfAvailable(
                        null,
                        child.id,
                        10
                    ))
                )
                    throw new Error(
                        'Demo combo has insufficient component stock'
                    );
                child.stock -= 10;
            }
            await stockRepository.addStock(null, product.id, 10);
            products.push({ ...product, stock: 10, group: 'combo' });
            count('products');
            count('productUnits');
        }

        const customers = [];
        for (const [index, name] of fixtures.customers.entries()) {
            const customer = await demoRepository.createCustomer({
                name,
                phone: `099${String(1000000 + index)}`,
                status:
                    index === 38
                        ? 'Inactive'
                        : index === 39
                          ? 'Blocked'
                          : 'Active',
                loyaltyPoints: 0,
                totalSpending: 0,
                createdAt: at(55),
                updatedAt: at(55)
            });
            await demoRepository.recordPoints(
                customer.id,
                null,
                60 + index,
                'ADJUST_MANUAL',
                at(50)
            );
            customers.push({ ...customer, points: 60 + index });
            count('customers');
        }
        const promotionSpecs = [
            ['DEMO: Giảm 10% nước giải khát', 'Percent', 10, 'soft', 'Active'],
            [
                'DEMO: Giảm 2.000đ thực phẩm ăn liền',
                'Amount',
                2000,
                'instant',
                'Active'
            ],
            [
                'DEMO: Tuần lễ bánh kẹo đã kết thúc',
                'Percent',
                15,
                'snack',
                'Expired'
            ],
            ['DEMO: Ưu đãi gia dụng tạm dừng', 'Percent', 5, 'home', 'Disabled']
        ];
        const promotions = [];
        for (const [name, type, value, group, status] of promotionSpecs) {
            promotions.push(
                await demoRepository.createPromotion(
                    {
                        name,
                        type,
                        value,
                        status,
                        startDate: at(60),
                        endDate: at(status === 'Expired' ? 2 : -45),
                        createdAt: at(60)
                    },
                    [{ categoryId: categories[group].id }]
                )
            );
            count('promotions');
        }
        const voucherSpecs = [
            ['DEMO10', 'Percent', 10, 50000, 100, 'Active'],
            ['DEMO20K', 'Fixed', 20000, 150000, 80, 'Active'],
            ['DEMO5K', 'Fixed', 5000, 30000, 200, 'Active'],
            ['DEMOHETHAN', 'Fixed', 10000, 30000, 50, 'Expired'],
            ['DEMODUNG', 'Percent', 15, 50000, 30, 'Disabled'],
            ['DEMOHETLUOT', 'Fixed', 1000, 0, 2, 'Active']
        ];
        const vouchers = [];
        for (const [
            code,
            type,
            value,
            minOrderValue,
            maxUsage,
            status
        ] of voucherSpecs) {
            vouchers.push(
                await demoRepository.createVoucher({
                    code,
                    type,
                    value,
                    minOrderValue,
                    maxUsage,
                    currentUsage: 0,
                    status,
                    startDate: at(60),
                    expiryDate: at(status === 'Expired' ? 1 : -45),
                    createdAt: at(60)
                })
            );
            count('vouchers');
        }

        const shiftSpecs = [
            ['Ca đêm (Demo)', 0, 6],
            ['Ca sáng (Demo)', 6, 12],
            ['Ca chiều (Demo)', 12, 18],
            ['Ca tối (Demo)', 18, 23]
        ];
        const shifts = [];
        for (const [name, start, end] of shiftSpecs) {
            const startTime = `${String(start).padStart(2, '0')}:00`;
            const endTime =
                end === 23 ? '23:59' : `${String(end).padStart(2, '0')}:00`;
            shifts.push({
                ...(await demoRepository.createShift({
                    name,
                    startTime,
                    endTime,
                    checkInStart: startTime,
                    checkInEnd: `${String(start).padStart(2, '0')}:15`,
                    checkOutDeadline: endTime,
                    isActive: true
                })),
                startHour: start,
                endHour: end === 23 ? 24 : end,
                hours: end === 23 ? 359 / 60 : 6
            });
            count('shifts');
        }
        const activeShift = shifts[Math.floor(local.getUTCHours() / 6)];
        const scheduledEmployees = [...cashiers, ...warehouse];
        const schedules = [];
        for (let daysAgo = 30; daysAgo >= -7; daysAgo--)
            for (const [index, employee] of scheduledEmployees.entries()) {
                const shift =
                    daysAgo === 0
                        ? activeShift
                        : shifts[1 + ((Math.abs(daysAgo) + index) % 3)];
                const workDate = day(daysAgo);
                const existing = await demoRepository.findSchedule(
                    employee.id,
                    shift.id,
                    workDate
                );
                if (existing) continue;
                const status =
                    daysAgo < 0
                        ? 'assigned'
                        : daysAgo === 0
                          ? 'working'
                          : (daysAgo + index) % 13 === 0
                            ? 'absent'
                            : 'completed';
                const late =
                    status === 'completed' && (daysAgo + index) % 9 === 0;
                const schedule = await demoRepository.createSchedule({
                    staffId: employee.id,
                    shiftId: shift.id,
                    workDate,
                    status,
                    checkInTime: ['completed', 'working'].includes(status)
                        ? new Date(
                              Math.min(
                                  now.getTime(),
                                  at(
                                      daysAgo,
                                      shift.startHour,
                                      late ? 20 : 0
                                  ).getTime()
                              )
                          )
                        : null,
                    checkOutTime:
                        status === 'completed'
                            ? at(
                                  daysAgo,
                                  shift.endHour === 24 ? 23 : shift.endHour,
                                  shift.endHour === 24 ? 59 : 0
                              )
                            : null,
                    workedHours: status === 'completed' ? shift.hours : 0,
                    attendanceRecord:
                        status === 'absent'
                            ? 'Absent'
                            : late
                              ? `LateIn[${String(shift.startHour).padStart(2, '0')}:20]`
                              : 'OnTime',
                    penaltyAmount:
                        status === 'absent' ? 50000 : late ? 10000 : 0,
                    note: 'DEMO: lịch làm mẫu'
                });
                schedules.push({
                    ...schedule,
                    daysAgo,
                    shift,
                    employee,
                    systemCash: 0
                });
                count('schedules');
            }

        const saleProducts = [...products.slice(0, 40), products[42]];
        const paidInvoices = [];
        for (let index = 0; index < 93; index++) {
            const paid = index < 80;
            const pendingPayment = index >= 86 && index < 90;
            const status = paid ? 'PAID' : index < 90 ? 'UNPAID' : 'CANCELLED';
            const daysAgo =
                index < 10 || !paid ? 0 : 1 + Math.floor((index - 10) / 3);
            let staff = cashiers[index % cashiers.length];
            let schedule = schedules.find(
                (row) =>
                    row.employee.id === staff.id &&
                    row.daysAgo === daysAgo &&
                    ['working', 'completed'].includes(row.status)
            );
            if (!schedule) {
                schedule = schedules.find(
                    (row) =>
                        row.daysAgo === daysAgo &&
                        row.employee.roleName === 'Cashier' &&
                        ['working', 'completed'].includes(row.status)
                );
                staff = schedule?.employee || cashiers[0];
            }
            const createdAt =
                daysAgo === 0
                    ? new Date(
                          Math.max(
                              at(0, activeShift.startHour).getTime(),
                              now.getTime() - (index + 1) * 60000
                          )
                      )
                    : at(
                          daysAgo,
                          (schedule?.shift.startHour || 6) + 1 + (index % 3),
                          index % 60
                      );
            const customer =
                index % 9 === 0 && index > 1 ? null : customers[index % 36];
            const lines = [];
            let promotion = null,
                promotionDiscount = 0;
            for (let lineIndex = 0; lineIndex < 2 + (index % 2); lineIndex++) {
                const product =
                    saleProducts[
                        (index * 5 + lineIndex * 7) % saleProducts.length
                    ];
                const unit =
                    product.units[
                        index % 5 === 0 &&
                        lineIndex === 0 &&
                        product.units.length > 1
                            ? 1
                            : 0
                    ];
                const quantity = product.allowDecimalQuantity
                    ? 0.5 + 0.125 * (index % 4)
                    : 1 + ((index + lineIndex) % 3);
                let unitPrice = unit.salePrice;
                if (paid && index % 4 === 0 && product.group === 'soft') {
                    promotion = promotions[0];
                    unitPrice = round(unitPrice * 0.9);
                } else if (
                    paid &&
                    index % 4 === 1 &&
                    product.group === 'instant'
                ) {
                    promotion = promotions[1];
                    unitPrice = Math.max(0, unitPrice - 2000);
                }
                promotionDiscount = round(
                    promotionDiscount + (unit.salePrice - unitPrice) * quantity
                );
                lines.push({
                    productId: product.id,
                    productUnitId: unit.id,
                    productName: product.name,
                    unitName: unit.unitName,
                    unitPrice,
                    quantity,
                    baseQuantity: roundQuantity(
                        quantity * unit.conversionFactor
                    ),
                    lineTotal: round(quantity * unitPrice)
                });
            }
            const totalAmount = round(
                lines.reduce((total, line) => total + line.lineTotal, 0)
            );
            let voucher =
                paid && index < 2
                    ? vouchers[5]
                    : paid && index % 4 === 0
                      ? vouchers[index % 3]
                      : null;
            if (!customer || (voucher && totalAmount < voucher.minOrderValue))
                voucher = null;
            const voucherDiscount = voucher
                ? round(
                      Math.min(
                          totalAmount,
                          voucher.type === 'Percent'
                              ? (totalAmount * voucher.value) / 100
                              : voucher.value
                      )
                  )
                : 0;
            const usedPoints =
                paid && customer && index % 5 === 0
                    ? Math.min(
                          5,
                          customer.points,
                          Math.floor((totalAmount - voucherDiscount) / 100)
                      )
                    : 0;
            const pointDiscount = usedPoints * 100;
            const finalAmount = round(
                totalAmount - voucherDiscount - pointDiscount
            );
            const paymentMethod =
                index % 3 === 0 || pendingPayment ? 'BANK_TRANSFER' : 'CASH';
            const payment =
                paid || pendingPayment
                    ? {
                          amount: finalAmount,
                          status: paid ? 'SUCCESS' : 'PENDING',
                          paymentMethod,
                          transactionId:
                              paid && paymentMethod === 'BANK_TRANSFER'
                                  ? `DEMO-TX-${String(index + 1).padStart(4, '0')}`
                                  : null,
                          createdAt
                      }
                    : null;
            const invoice = await demoRepository.createInvoiceWithItems(
                {
                    invoiceCode: `DEMO-INV-${day(daysAgo).replace(/-/g, '')}-${String(index + 1).padStart(3, '0')}`,
                    staffId: staff.id,
                    counterId: counters[index % counters.length].id,
                    customerId: customer?.id || null,
                    totalAmount,
                    finalAmount,
                    promotionId: promotion?.id || null,
                    promotionDiscount,
                    voucherId: voucher?.id || null,
                    voucherDiscount,
                    usedPoints,
                    pointDiscount,
                    status,
                    createdAt
                },
                lines,
                payment
            );
            count('invoices');
            if (payment) count('payments');
            if (paid) {
                for (const line of lines) {
                    const product = products.find(
                        (row) => row.id === line.productId
                    );
                    if (
                        !(await stockRepository.decreaseStockIfAvailable(
                            null,
                            product.id,
                            line.baseQuantity
                        ))
                    )
                        throw new Error(
                            `Demo sale exceeds stock for ${product.code}`
                        );
                    product.stock = roundQuantity(
                        product.stock - line.baseQuantity
                    );
                }
                if (customer) {
                    if (usedPoints) {
                        await demoRepository.recordPoints(
                            customer.id,
                            invoice.id,
                            -usedPoints,
                            'REDEEM',
                            createdAt
                        );
                        customer.points -= usedPoints;
                    }
                    const earned = Math.floor(finalAmount / 10000);
                    if (earned) {
                        await demoRepository.recordPoints(
                            customer.id,
                            invoice.id,
                            earned,
                            'EARN',
                            createdAt
                        );
                        customer.points += earned;
                    }
                    await demoRepository.recordSpending(
                        customer.id,
                        finalAmount
                    );
                }
                if (voucher)
                    await demoRepository.recordVoucherUse(
                        voucher.id,
                        customer.id,
                        invoice.id,
                        createdAt
                    );
                if (paymentMethod === 'CASH' && schedule)
                    schedule.systemCash = round(
                        schedule.systemCash + finalAmount
                    );
                paidInvoices.push({ ...invoice, customer });
            }
        }

        for (let index = 0; index < 6; index++) {
            const invoice = paidInvoices[5 + index * 5];
            const line = invoice.items[0];
            const product = products.find((row) => row.id === line.productId);
            const quantity = product.allowDecimalQuantity
                ? Math.min(0.25, line.quantity)
                : 1;
            const baseQuantity = roundQuantity(
                (quantity * line.baseQuantity) / line.quantity
            );
            const refundAmount = round(
                (quantity * line.unitPrice * invoice.finalAmount) /
                    invoice.totalAmount
            );
            const approved = index < 3;
            const restocked = index < 2;
            const createdAt = new Date(
                Math.min(
                    now.getTime(),
                    invoice.createdAt.getTime() + 2 * 3600000
                )
            );
            await demoRepository.createReturn(
                {
                    invoiceId: invoice.id,
                    counterId: invoice.counterId,
                    staffId: invoice.staffId,
                    returnType: 'REFUND',
                    refundMethod: 'CASH',
                    totalRefundAmount: refundAmount,
                    reason: 'DEMO: khách đổi nhu cầu hoặc bao bì hư hỏng',
                    status: approved
                        ? 'Approve'
                        : index === 3
                          ? 'Pending'
                          : 'Reject',
                    createdAt,
                    approveBy: index === 3 ? null : admin.id,
                    approvedAt: index === 3 ? null : createdAt,
                    note: 'DEMO: hoàn trả mẫu'
                },
                [
                    {
                        invoiceItemId: line.id,
                        productId: line.productId,
                        productUnitId: line.productUnitId,
                        productName: line.productName,
                        unitName: line.unitName,
                        quantity,
                        baseQuantity,
                        refundAmount,
                        restockApproved: restocked
                            ? 'Approved'
                            : approved || index === 3
                              ? 'Pending'
                              : 'Cancel',
                        checkedBy: restocked ? warehouse[0].id : null,
                        checkedAt: restocked ? createdAt : null
                    }
                ]
            );
            if (restocked) {
                await stockRepository.addStock(null, product.id, baseQuantity);
                product.stock = roundQuantity(product.stock + baseQuantity);
            }
            if (approved && invoice.customer) {
                const restore = Math.round(
                    (invoice.usedPoints * refundAmount) / invoice.finalAmount
                );
                const revoke = Math.floor(refundAmount / 10000);
                if (restore) {
                    await demoRepository.recordPoints(
                        invoice.customer.id,
                        invoice.id,
                        restore,
                        'PARTIAL_REFUND_POINTS',
                        createdAt
                    );
                    invoice.customer.points += restore;
                }
                if (revoke) {
                    await demoRepository.recordPoints(
                        invoice.customer.id,
                        invoice.id,
                        -revoke,
                        'PARTIAL_REVOKE_POINTS',
                        createdAt
                    );
                    invoice.customer.points -= revoke;
                }
            }
            count('returns');
        }

        for (const [index, status] of [
            'Approved',
            'Pending',
            'Rejected'
        ].entries()) {
            const product = products[[40, 41, 44][index]];
            const actualQuantity =
                status === 'Approved'
                    ? Math.max(0, product.stock - 2)
                    : product.stock + 1;
            await demoRepository.createAdjustment(
                {
                    createdBy: warehouse[0].id,
                    reason: 'DEMO: kiểm kê cuối ngày',
                    status,
                    createdAt: at(index + 1),
                    processedBy: status === 'Pending' ? null : admin.id,
                    processedAt: status === 'Pending' ? null : at(index + 1, 16)
                },
                {
                    productId: product.id,
                    systemQuantity: product.stock,
                    actualQuantity
                }
            );
            if (status === 'Approved') {
                const changed = await stockRepository.updateStock(
                    null,
                    product.id,
                    actualQuantity - product.stock
                );
                if (!changed)
                    throw new Error('Demo adjustment stock update failed');
                product.stock = actualQuantity;
            }
            await demoRepository.createReport({
                title: [
                    'DEMO: Phát hiện bao bì bị móp',
                    'DEMO: Đã xử lý hàng gần hết hạn',
                    'DEMO: Kiểm tra nhãn đơn vị cân'
                ][index],
                issueDescription:
                    'Dữ liệu minh họa để thử quy trình báo cáo và xử lý hàng hóa.',
                reportedBy: warehouse[index].id,
                status: index === 1 ? 'PROCESSED' : 'OPEN',
                createdAt: at(index + 1)
            });
            count('adjustments');
            count('reports');
        }

        for (const [index, schedule] of schedules.entries())
            if (
                schedule.employee.roleName === 'Cashier' &&
                ['completed', 'working'].includes(schedule.status)
            ) {
                const openingCash = 500000;
                const finished = schedule.status === 'completed';
                const difference =
                    finished && index % 17 === 0
                        ? -1000
                        : finished && index % 23 === 0
                          ? 1000
                          : 0;
                await demoRepository.createHandover({
                    scheduleId: schedule.id,
                    openingCash,
                    systemCash: finished ? schedule.systemCash : 0,
                    actualCash: finished
                        ? openingCash + schedule.systemCash + difference
                        : 0,
                    note: difference
                        ? 'DEMO: chênh lệch kiểm đếm mẫu'
                        : 'DEMO: bàn giao ca mẫu',
                    handoverTime: finished
                        ? schedule.checkOutTime
                        : schedule.checkInTime
                });
                count('handovers');
            }
        const previousMonth = new Date(
            Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1)
        );
        const period = `${previousMonth.getUTCFullYear()}-${String(previousMonth.getUTCMonth() + 1).padStart(2, '0')}`;
        for (const employee of employees) {
            const worked = schedules.filter(
                (schedule) =>
                    schedule.staffId === employee.id &&
                    schedule.workDate.startsWith(period) &&
                    schedule.status === 'completed'
            );
            const deductions = schedules
                .filter(
                    (schedule) =>
                        schedule.staffId === employee.id &&
                        schedule.workDate.startsWith(period)
                )
                .reduce((sum, row) => sum + row.penaltyAmount, 0);
            const workUnit =
                employee.salaryType === 'hourly'
                    ? round(
                          worked.reduce(
                              (total, schedule) => total + schedule.workedHours,
                              0
                          )
                      )
                    : worked.length;
            const gross = round(
                employee.salaryType === 'hourly'
                    ? employee.baseSalary * workUnit
                    : (employee.baseSalary / 26) * workUnit
            );
            await demoRepository.createPayroll({
                staffId: employee.id,
                month: previousMonth.getUTCMonth() + 1,
                year: previousMonth.getUTCFullYear(),
                appliedBaseSalary: employee.baseSalary,
                appliedSalaryType: employee.salaryType,
                totalWorkUnit: workUnit,
                provisionalSalary: gross,
                deductions,
                finalAmount: Math.max(0, gross - deductions),
                status: 'paid',
                note: 'DEMO: bảng lương tháng trước',
                createdAt: at(0)
            });
            count('payrolls');
        }
        await demoRepository.completeBatch(fixtures.batchKey, counts, now);
        return { alreadySeeded: false, counts, completedAt: now };
    });
};
