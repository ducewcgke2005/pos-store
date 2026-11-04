// Development fixtures only. No real customer contact information or bank transfers.
const groups = [
    {
        key: 'soft',
        parent: 'drinks',
        name: 'Nước giải khát',
        unit: 'Chai',
        pack: 'Lốc 6 chai',
        factor: 6,
        items: [
            ['Nước suối Lavie 500ml', 6000],
            ['Nước ngọt Coca-Cola 390ml', 10000],
            ['Trà xanh Không Độ 455ml', 12000],
            ['Nước cam Twister 350ml', 11000],
            ['Cà phê Highlands lon 185ml', 15000],
            ['Nước khoáng Vĩnh Hảo 500ml', 6500]
        ]
    },
    {
        key: 'milk',
        parent: 'drinks',
        name: 'Sữa và đồ uống dinh dưỡng',
        unit: 'Hộp',
        pack: 'Thùng 12 hộp',
        factor: 12,
        items: [
            ['Sữa tươi Vinamilk 180ml', 8000],
            ['Sữa TH true MILK 180ml', 9000],
            ['Sữa Milo 180ml', 8500],
            ['Sữa đậu nành Fami 200ml', 7000],
            ['Sữa chua uống Yomost 170ml', 8000],
            ['Sữa tươi không đường 1 lít', 35000]
        ]
    },
    {
        key: 'instant',
        parent: 'food',
        name: 'Mì và thực phẩm ăn liền',
        unit: 'Gói',
        pack: 'Thùng 12 gói',
        factor: 12,
        items: [
            ['Mì Hảo Hảo tôm chua cay', 4500],
            ['Mì Omachi bò hầm', 9500],
            ['Mì Kokomi đại', 4000],
            ['Phở bò Vifon', 8500],
            ['Cháo Gấu Đỏ thịt bằm', 6000],
            ['Miến Phú Hương sườn heo', 10000]
        ]
    },
    {
        key: 'snack',
        parent: 'food',
        name: 'Bánh kẹo',
        unit: 'Gói',
        pack: 'Hộp 6 gói',
        factor: 6,
        items: [
            ['Bánh Oreo 133g', 18000],
            ['Bánh Chocopie 6 cái', 32000],
            ['Snack Oishi tôm cay 42g', 7000],
            ['Bánh Cosy bơ sữa 238g', 28000],
            ['Kẹo Alpenliebe 120g', 20000],
            ['Bánh quy AFC 100g', 19000]
        ]
    },
    {
        key: 'staple',
        parent: 'food',
        name: 'Gạo và gia vị',
        unit: 'Túi',
        pack: 'Thùng 6 túi',
        factor: 6,
        items: [
            ['Gạo ST25 túi 5kg', 170000],
            ['Đường Biên Hòa 1kg', 28000],
            ['Muối i-ốt 500g', 8000],
            ['Hạt nêm Knorr 400g', 39000],
            ['Bột ngọt Ajinomoto 400g', 36000],
            ['Bột mì đa dụng 1kg', 24000]
        ]
    },
    {
        key: 'hygiene',
        parent: 'personal',
        name: 'Vệ sinh cá nhân',
        unit: 'Cái',
        pack: 'Lốc 6 cái',
        factor: 6,
        items: [
            ['Kem đánh răng P/S 180g', 32000],
            ['Bàn chải Colgate mềm', 22000],
            ['Xà bông Lifebuoy 90g', 16000],
            ['Dầu gội Clear 170g', 62000],
            ['Sữa tắm Dove 200g', 59000],
            ['Khăn giấy Kleenex 180 tờ', 28000]
        ]
    },
    {
        key: 'home',
        parent: 'household',
        name: 'Giặt tẩy và đồ gia dụng',
        unit: 'Chai',
        pack: 'Thùng 6 chai',
        factor: 6,
        items: [
            ['Nước rửa chén Sunlight 750g', 32000],
            ['Nước lau sàn Sunlight 1kg', 35000],
            ['Nước giặt Omo 800g', 65000],
            ['Nước xả Comfort 800ml', 55000],
            ['Nước tẩy Javel 1 lít', 19000],
            ['Nước lau kính 500ml', 25000]
        ]
    },
    {
        key: 'fresh',
        parent: 'food',
        name: 'Thực phẩm cân ký',
        unit: 'Kg',
        factor: 1,
        items: [
            ['Táo đỏ', 55000],
            ['Cam sành', 35000],
            ['Chuối già', 25000],
            ['Khoai tây', 30000],
            ['Cà chua', 28000],
            ['Dưa leo', 22000]
        ]
    }
];
const roots = [
    { key: 'drinks', name: 'Đồ uống' },
    { key: 'food', name: 'Thực phẩm' },
    { key: 'personal', name: 'Chăm sóc cá nhân' },
    { key: 'household', name: 'Gia dụng' }
];
const customers = [
    'Nguyễn Minh Anh',
    'Trần Hoàng Nam',
    'Lê Thu Hà',
    'Phạm Quốc Bảo',
    'Hoàng Ngọc Linh',
    'Đặng Thanh Tùng',
    'Bùi Phương Thảo',
    'Đỗ Đức Huy',
    'Hồ Quỳnh Như',
    'Ngô Hải Đăng',
    'Dương Bảo Ngọc',
    'Lý Thành Đạt',
    'Vũ Mỹ Duyên',
    'Phan Gia Hân',
    'Mai Trung Kiên',
    'Nguyễn Thị Lan',
    'Trần Văn Phúc',
    'Lê Hồng Nhung',
    'Phạm Tuấn Anh',
    'Hoàng Kim Chi',
    'Đặng Minh Khang',
    'Bùi Thảo Vy',
    'Đỗ Thanh Bình',
    'Hồ Ngọc Mai',
    'Ngô Khánh Duy',
    'Dương Thu Trang',
    'Lý Minh Quân',
    'Vũ Thanh Tâm',
    'Phan Nhật Minh',
    'Mai Hoài An',
    'Nguyễn Bảo Trâm',
    'Trần Đức Long',
    'Lê Ngọc Hân',
    'Phạm Hữu Nghĩa',
    'Hoàng Yến Nhi',
    'Đặng Gia Bảo',
    'Bùi Minh Châu',
    'Đỗ Hồng Phúc',
    'Hồ Thùy Dương',
    'Ngô Anh Thư'
];
const suppliers = [
    ['Phân phối Đồ uống An Phát (Demo)', '12 Nguyễn Văn Cừ, TP.HCM'],
    ['Thực phẩm Bình Minh (Demo)', '25 Lê Văn Việt, TP.HCM'],
    ['Hàng tiêu dùng Việt Hưng (Demo)', '34 Võ Văn Ngân, TP.HCM'],
    ['Nông sản Xanh (Demo)', '56 Nguyễn Duy Trinh, TP.HCM'],
    ['Thương mại Phúc Lộc (Demo)', '78 Kha Vạn Cân, TP.HCM'],
    ['Đại lý Tổng hợp Minh Tâm (Demo)', '90 Đặng Văn Bi, TP.HCM']
];
const employees = [
    ['demo.cashier1@pos.com', 'Trần Thị Hạnh', 'Cashier', 'hourly', 28000],
    ['demo.cashier2@pos.com', 'Lê Minh Tuấn', 'Cashier', 'hourly', 30000],
    ['demo.cashier3@pos.com', 'Phạm Ngọc Ánh', 'Cashier', 'hourly', 26000],
    [
        'demo.warehouse1@pos.com',
        'Nguyễn Đức Thành',
        'Warehouse',
        'monthly',
        12000000
    ],
    [
        'demo.warehouse2@pos.com',
        'Vũ Thanh Sơn',
        'Warehouse',
        'monthly',
        11500000
    ]
];

module.exports = {
    batchKey: 'localstore-demo-v1',
    roots,
    groups,
    customers,
    suppliers,
    employees
};
