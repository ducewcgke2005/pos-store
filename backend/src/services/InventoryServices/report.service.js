const reportRepository = require("../../repositories/poReport.repository");

const getMonthlyReport = async ({
    month,
    year,
    supplierId
}) => {

    if (month < 1 || month > 12) {
        throw new Error("INVALID_MONTH");
    }

    return await reportRepository.getMonthlyReport({
        month,
        year,
        supplierId
    });
};

module.exports = {
    getMonthlyReport
};